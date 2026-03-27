export interface FunnelPattern {
  type: 'landing_page' | 'lead_magnet' | 'email_capture' | 'booking_embed' | 'checkout' | 'chatbot' | 'upsell' | 'free_offer' | 'consultation' | 'contact_page';
  urlPatterns: RegExp[];
  htmlPatterns: RegExp[];
  score: number; // contribution to funnelScore
}

export const FUNNEL_PATTERNS: FunnelPattern[] = [
  {
    type: 'landing_page',
    urlPatterns: [/\/lp\/|\/landing|\/offer|\/promo|\/deal|\/special/i],
    htmlPatterns: [/limited.{0,20}time|act now|claim your|get started|exclusive offer/i],
    score: 1.5,
  },
  {
    type: 'lead_magnet',
    urlPatterns: [/\/free|\/download|\/guide|\/report|\/checklist|\/ebook/i],
    htmlPatterns: [/free guide|free report|download now|instant access|free checklist|free ebook/i],
    score: 1.5,
  },
  {
    type: 'email_capture',
    urlPatterns: [],
    htmlPatterns: [
      /<form[^>]*>[\s\S]*?<input[^>]*type=["']?email/i,
      /<form[^>]*>[\s\S]*?<textarea/i,
      /contact.{0,10}form|get.{0,10}touch|send.{0,10}message|request.{0,10}quote/i,
    ],
    score: 1.0,
  },
  {
    type: 'booking_embed',
    urlPatterns: [/\/book|\/schedule|\/appointment|\/consult/i],
    htmlPatterns: [/calendly\.com|acuityscheduling|simplybook|mindbodyonline|book.{0,20}appointment/i],
    score: 2.0,
  },
  {
    type: 'checkout',
    urlPatterns: [/\/checkout|\/cart|\/buy|\/order|\/purchase/i],
    htmlPatterns: [/add.{0,10}cart|buy now|checkout|stripe\.js|paypal/i],
    score: 1.5,
  },
  {
    type: 'chatbot',
    urlPatterns: [],
    htmlPatterns: [/intercom|drift\.js|tidio|livechat|tawk\.to|crisp\.chat/i],
    score: 0.5,
  },
  {
    type: 'free_offer',
    urlPatterns: [/\/free-|free-trial|\/trial/i],
    htmlPatterns: [/free trial|try for free|no credit card|free forever|get it free/i],
    score: 1.0,
  },
  {
    type: 'consultation',
    urlPatterns: [/\/consult|\/discovery|\/strategy-call|\/free-call/i],
    htmlPatterns: [
      /free consultation|free strategy|book a call|discovery call|schedule.*free/i,
      /free estimate|get a quote|request.*quote|schedule.*service|book.*service/i,
    ],
    score: 2.0,
  },
  {
    type: 'contact_page',
    urlPatterns: [/\/contact|\/get-in-touch|\/reach-us/i],
    htmlPatterns: [/contact us|get in touch|reach out|send us a message/i],
    score: 1.0,
  },
];

export function scoreFunnel(elements: { type: string }[]): number {
  const typeScores: Record<string, number> = {};
  for (const pattern of FUNNEL_PATTERNS) {
    typeScores[pattern.type] = pattern.score;
  }
  const total = elements.reduce((sum, el) => sum + (typeScores[el.type] ?? 0.5), 0);
  return Math.min(10, Math.round(total * 10) / 10);
}
