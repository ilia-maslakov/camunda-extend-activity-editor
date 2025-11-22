'use strict';

/**
 * OpenAiClient
 * - читает токен и промпты из localStorage
 * - формирует запрос к OpenAI chat/completions
 * - ожидает ответ строго в формате [{ Id, entry, new }]
 */

function OpenAiClient() {}

/**
 * elements: [{ Id, Name, Type, Topic, FormKey }, ...]
 * selectedType: 'ServiceTask' | 'UserTask' | ...
 * selectedField: 'id' | 'name' | 'topic' | 'formKey'
 * prefixValue: string
 */
OpenAiClient.prototype.generateSmartOnes = function (elements, selectedType, selectedField, prefixValue) {
  var token = '';
  try { token = localStorage.getItem('openai_token') || ''; } catch (e) {}

  if (!token || token.indexOf('sk-') !== 0) {
    alert('❌ OpenAI token not found. Please set it first in Prompt Settings.');
    return Promise.resolve([]);
  }

  var fieldKey = (selectedField || 'id').toLowerCase();

  console.log('selectedType: ', selectedType);
  console.log('selectedField: ', selectedField);
  console.log('prefix: ', prefixValue);

  var promptKeyMap = {
    'id': 'prompt_id',
    'name': 'prompt_name',
    'topic': 'prompt_topic',
    'formkey': 'prompt_formKey'
  };
  var storagePromptKey = promptKeyMap[fieldKey] || 'prompt_id';

  var userPrompt = '';
  try { userPrompt = localStorage.getItem(storagePromptKey) || ''; } catch (e) {}

  if (!userPrompt) {
    if (fieldKey === 'id') userPrompt = 'Generate meaningful CamelCase IDs with given prefix.';
    if (fieldKey === 'name') userPrompt = 'Improve concise English names for tasks.';
    if (fieldKey === 'topic') userPrompt = 'Generate kebab-case ServiceTask topics with given prefix.';
    if (fieldKey === 'formkey') userPrompt = 'Generate form keys like prefix/verb-noun.';
  }

  try {
    console.log('[OpenAI] Selected field:', fieldKey);
    console.log('[OpenAI] Prompt key:', storagePromptKey);
    console.log('[OpenAI] Prefix:', prefixValue);
    console.log('[OpenAI] Selected activities:', elements);
  } catch (_) {}

  const systemMsg =
    'You are an assistant that returns ONLY VALID JSON. ' +
    'No comments, no markdown. ' +
    'Return an array of objects strictly like: ' +
    '[{ "Id": "<existing BPMN id>", "entry": "Id|Name|Topic|FormKey", "new": "<new value>" }].';

  let fieldInstruction = '';
  if (fieldKey === 'id') {
    fieldInstruction =
      'Entry MUST be "Id". Produce CamelCase ASCII identifiers starting with prefix. ' +
      'No spaces, only letters/digits/underscore. Example: Activity_ + StartAudit -> Activity_StartAudit';
  } else if (fieldKey === 'name') {
    fieldInstruction =
      'Entry MUST be "Name". Produce short, clear English names (1–3 words).';
  } else if (fieldKey === 'topic') {
    fieldInstruction =
      'Entry MUST be "Topic". Produce kebab-case topics for Camunda ServiceTask ' +
      'starting with prefix. Example: topic- + generate-report -> topic-generate-report';
  } else if (fieldKey === 'formkey') {
    fieldInstruction =
      'Entry MUST be "FormKey". Produce lowercase form keys like "prefix/verb-noun".';
  }

  var userMsg =
    userPrompt + '\n\n' +
    'Field to generate: ' + fieldKey + '\n' +
    'Type context: ' + (selectedType || '-') + '\n' +
    'Prefix: "' + prefixValue + '"\n' +
    'Source elements (JSON):\n' + safeStringify(elements) + '\n' +
    'Return ONLY pure JSON array; no markdown fences.\n' +
    'Each item MUST include: Id, entry, new.\n' +
    fieldInstruction;

  var body = {
    model: 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: userMsg }
    ]
  };

  try {
    console.log('[OpenAI] Starting generation...');
  } catch (_) {}

  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  .then(function (res) {
    if (!res.ok) console.error('[OpenAI] HTTP status:', res.status);
    return res.json();
  })
  .then(function (data) {
    var content = '';
    try {
      content = data.choices[0].message.content;
    } catch (e) {
      console.warn('[OpenAI] Bad response structure:', data);
      return [];
    }

    content = stripCodeFences(content);
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.warn('[OpenAI] Cannot parse JSON:', content);
      parsed = [];
    }

    if (!Array.isArray(parsed)) {
      console.warn('[OpenAI] Non-array response:', parsed);
      return [];
    }

    const normalized = parsed.map(function (it) {
      const e = (it.entry || '').toLowerCase();
      const entryNorm =
        e === 'id' ? 'Id' :
          e === 'name' ? 'Name' :
            e === 'topic' ? 'Topic' :
              e === 'formkey' ? 'FormKey' : it.entry;
      return {Id: it.Id, entry: entryNorm, new: it.new};
    });

    console.log('[OpenAI] Normalized:', normalized);
    return normalized;
  })
  .catch(function (err) {
    console.error('[OpenAI] API error:', err);
    return [];
  });
};

function stripCodeFences(s) {
  if (!s || typeof s !== 'string') return s;
  var m = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return m && m[1] ? m[1] : s;
}

function safeStringify(obj) {
  try { return JSON.stringify(obj); } catch (e) { return '[]'; }
}

module.exports = OpenAiClient;
