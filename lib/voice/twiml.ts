// @ts-nocheck
/**
 * Helpers para gerar TwiML (XML de resposta do Twilio Voice).
 * https://www.twilio.com/docs/voice/twiml
 */

function escape(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function twimlSay(opts: {
  text: string;
  voice?: string;
  language?: string;
  gatherActionUrl?: string;
  hangup?: boolean;
  transferTo?: string;
}) {
  const voice = opts.voice || 'Polly.Camila-Neural';
  const language = opts.language || 'pt-BR';
  const say = `<Say voice="${voice}" language="${language}">${escape(opts.text)}</Say>`;

  if (opts.transferTo) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>${say}<Dial>${escape(opts.transferTo)}</Dial></Response>`;
  }
  if (opts.hangup) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>${say}<Hangup/></Response>`;
  }
  if (opts.gatherActionUrl) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response><Gather input="speech" language="${language}" speechTimeout="auto" speechModel="phone_call" action="${escape(opts.gatherActionUrl)}" method="POST">${say}</Gather><Redirect>${escape(opts.gatherActionUrl)}?timeout=1</Redirect></Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>${say}</Response>`;
}
