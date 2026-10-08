/**
 * AiProvider — adapter ให้สลับ OpenAI / Gemini / Claude ได้จาก config
 *
 * interface เดียว: AiProvider.callJson({system, user, schema, schemaName}, cfg)
 *   → { data: object, usage: {input, output}, provider, model }
 *
 * aiBuildRequest_ / aiParseResponse_ / toGeminiSchema_ เป็น pure function (มี unit test)
 */

/** แปลง JSON Schema → OpenAPI subset ที่ Gemini responseSchema รับ */
function toGeminiSchema_(s) {
  if (Array.isArray(s)) return s.map(toGeminiSchema_);
  if (!s || typeof s !== 'object') return s;
  var out = {};
  Object.keys(s).forEach(function (k) {
    if (k === 'additionalProperties') return;
    var v = s[k];
    if (k === 'type') {
      var types = Array.isArray(v) ? v : [v];
      var nonNull = types.filter(function (t) { return t !== 'null'; });
      out.type = String(nonNull[0] || 'string').toUpperCase();
      if (types.length !== nonNull.length) out.nullable = true;
    } else if (k === 'properties') {
      out.properties = {};
      Object.keys(v).forEach(function (p) { out.properties[p] = toGeminiSchema_(v[p]); });
      out.propertyOrdering = Object.keys(v);
    } else {
      out[k] = toGeminiSchema_(v);
    }
  });
  return out;
}

var CLAUDE_FALLBACK_MODELS = /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5-1)$/;

function aiBuildRequest_(provider, model, apiKey, req, cfg) {
  var body, url, headers = {};
  if (provider === 'openai') {
    url = 'https://api.openai.com/v1/chat/completions';
    headers.Authorization = 'Bearer ' + apiKey;
    body = {
      model: model,
      messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
      response_format: { type: 'json_schema', json_schema: { name: req.schemaName, strict: true, schema: req.schema } }
    };
  } else if (provider === 'gemini') {
    url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
    headers['x-goog-api-key'] = apiKey;
    body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: toGeminiSchema_(req.schema)
      }
    };
  } else if (provider === 'claude') {
    url = 'https://api.anthropic.com/v1/messages';
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = {
      model: model,
      max_tokens: 8000,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
      output_config: { format: { type: 'json_schema', schema: req.schema } }
    };
    if (cfg && cfg.AI_EFFORT) body.output_config.effort = cfg.AI_EFFORT;
    if (CLAUDE_FALLBACK_MODELS.test(model)) {
      // ถ้าโมเดลปฏิเสธ (refusal) ให้ API ลองโมเดลสำรองเองในคำขอเดียวกัน
      headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
      body.fallbacks = 'default';
    }
  } else {
    throw new Error('ไม่รู้จัก AI provider: ' + provider + ' (ใช้ได้: openai, gemini, claude)');
  }
  return {
    url: url,
    options: {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    }
  };
}

function aiParseResponse_(provider, json) {
  var text, usage = { input: 0, output: 0 };
  if (provider === 'openai') {
    var ch = json.choices && json.choices[0];
    if (!ch) throw new Error('OpenAI ไม่ได้ส่ง choices กลับมา');
    if (ch.message && ch.message.refusal) throw new Error('OpenAI ปฏิเสธ: ' + ch.message.refusal);
    if (ch.finish_reason === 'length') throw new Error('OpenAI ตอบไม่จบ (finish_reason=length)');
    text = ch.message.content;
    if (json.usage) usage = { input: json.usage.prompt_tokens || 0, output: json.usage.completion_tokens || 0 };
  } else if (provider === 'gemini') {
    var cand = json.candidates && json.candidates[0];
    if (!cand) throw new Error('Gemini ไม่ได้ส่งคำตอบ' + (json.promptFeedback ? ': ' + JSON.stringify(json.promptFeedback) : ''));
    if (cand.finishReason && cand.finishReason !== 'STOP') throw new Error('Gemini หยุดเพราะ ' + cand.finishReason);
    text = (cand.content && cand.content.parts || []).map(function (p) { return p.text || ''; }).join('');
    if (json.usageMetadata) usage = { input: json.usageMetadata.promptTokenCount || 0, output: json.usageMetadata.candidatesTokenCount || 0 };
  } else if (provider === 'claude') {
    if (json.stop_reason === 'refusal') {
      throw new Error('Claude ปฏิเสธคำขอ' + (json.stop_details && json.stop_details.category ? ' (' + json.stop_details.category + ')' : ''));
    }
    if (json.stop_reason === 'max_tokens') throw new Error('Claude ตอบไม่จบ (max_tokens)');
    text = (json.content || []).filter(function (b) { return b.type === 'text'; })
      .map(function (b) { return b.text; }).join('');
    if (json.usage) usage = { input: json.usage.input_tokens || 0, output: json.usage.output_tokens || 0 };
  }
  if (!text) throw new Error(provider + ' ไม่ได้ส่งข้อความกลับมา');
  var data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(provider + ' ตอบกลับไม่ใช่ JSON: ' + String(text).slice(0, 200));
  }
  return { data: data, usage: usage };
}

var AiProvider = (function () {
  var RETRY_CODES = { 408: 1, 429: 1, 500: 1, 502: 1, 503: 1, 504: 1, 529: 1 };

  function callJson(req, cfg) {
    cfg = cfg || getConfig_();
    var provider = cfg.AI_PROVIDER;
    var model = cfg.AI_MODEL || DEFAULT_MODELS[provider];
    var r = aiBuildRequest_(provider, model, getApiKey_(provider), req, cfg);
    var lastErr;
    for (var attempt = 0; attempt < 3; attempt++) {
      if (attempt) Utilities.sleep(2000 * Math.pow(2, attempt - 1));
      var resp;
      try {
        resp = UrlFetchApp.fetch(r.url, r.options);
      } catch (netErr) {
        lastErr = new Error(provider + ' เชื่อมต่อไม่ได้: ' + netErr.message);
        continue;
      }
      var code = resp.getResponseCode();
      var bodyText = resp.getContentText();
      if (code >= 200 && code < 300) {
        var parsed = aiParseResponse_(provider, JSON.parse(bodyText));
        parsed.provider = provider;
        parsed.model = model;
        return parsed;
      }
      lastErr = new Error(provider + ' HTTP ' + code + ': ' + bodyText.slice(0, 300));
      if (!RETRY_CODES[code]) break;
    }
    throw lastErr;
  }

  return { callJson: callJson };
})();
