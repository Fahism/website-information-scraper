export interface TechPattern {
  name: string;
  category: 'analytics' | 'crm' | 'email_marketing' | 'ads_pixel' | 'chat' | 'booking' | 'ecommerce' | 'cms' | 'hosting' | 'other';
  pattern: RegExp;
}

export const TECH_PATTERNS: TechPattern[] = [
  // Analytics
  { name: 'Google Analytics 4', category: 'analytics', pattern: /gtag\(|G-[A-Z0-9]+/i },
  { name: 'Google Tag Manager', category: 'analytics', pattern: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/i },
  { name: 'Hotjar', category: 'analytics', pattern: /hotjar\.com|static\.hotjar\.com/i },
  { name: 'Microsoft Clarity', category: 'analytics', pattern: /clarity\.ms\/tag/i },
  { name: 'Heap', category: 'analytics', pattern: /heap\.io|heapanalytics\.com/i },
  { name: 'Mixpanel', category: 'analytics', pattern: /mixpanel\.com\/track|cdn\.mxpnl\.com/i },
  { name: 'Amplitude', category: 'analytics', pattern: /amplitude\.com\/libs|cdn\.amplitude\.com/i },
  { name: 'Plausible', category: 'analytics', pattern: /plausible\.io\/js/i },
  { name: 'Matomo', category: 'analytics', pattern: /matomo\.js|piwik\.js/i },
  { name: 'Segment', category: 'analytics', pattern: /cdn\.segment\.com|analytics\.js/i },
  { name: 'FullStory', category: 'analytics', pattern: /fullstory\.com\/s\/fs\.js/i },
  { name: 'Lucky Orange', category: 'analytics', pattern: /luckyorange\.com/i },
  { name: 'Mouseflow', category: 'analytics', pattern: /mouseflow\.com/i },

  // Ads Pixels
  { name: 'Meta Pixel', category: 'ads_pixel', pattern: /connect\.facebook\.net|fbq\('init'/i },
  { name: 'TikTok Pixel', category: 'ads_pixel', pattern: /analytics\.tiktok\.com|ttq\.load/i },
  { name: 'Google Ads', category: 'ads_pixel', pattern: /googleadservices\.com|AW-\d+/i },
  { name: 'LinkedIn Insight Tag', category: 'ads_pixel', pattern: /snap\.licdn\.com|linkedin\.com\/insight/i },
  { name: 'Twitter Pixel', category: 'ads_pixel', pattern: /static\.ads-twitter\.com|twq\(/i },
  { name: 'Pinterest Tag', category: 'ads_pixel', pattern: /pintrk\(|s\.pinimg\.com\/ct\/core\.js/i },
  { name: 'Snapchat Pixel', category: 'ads_pixel', pattern: /sc-static\.net\/scevent\.min\.js|snaptr\(/i },
  { name: 'Microsoft UET', category: 'ads_pixel', pattern: /bat\.bing\.com\/bat\.js|uetq/i },

  // CRM / Marketing
  { name: 'HubSpot', category: 'crm', pattern: /hubspot\.com\/hs-scripts|hs-analytics\.net|js\.hs-scripts\.com/i },
  { name: 'GoHighLevel', category: 'crm', pattern: /highlevel\.com|msgsndr\.com/i },
  { name: 'Salesforce', category: 'crm', pattern: /salesforce\.com|pardot\.com/i },
  { name: 'ActiveCampaign', category: 'crm', pattern: /activecampaign\.com/i },
  { name: 'Zoho CRM', category: 'crm', pattern: /zoho\.com\/crm|salesiq\.zoho/i },
  { name: 'Pipedrive', category: 'crm', pattern: /pipedrive\.com/i },
  { name: 'Freshsales', category: 'crm', pattern: /freshsales\.io|freshworks\.com/i },
  { name: 'Keap', category: 'crm', pattern: /keap\.com|infusionsoft\.com/i },

  // Email Marketing
  { name: 'Mailchimp', category: 'email_marketing', pattern: /list-manage\.com|mailchimp\.com|chimpstatic\.com/i },
  { name: 'Klaviyo', category: 'email_marketing', pattern: /klaviyo\.com/i },
  { name: 'ConvertKit', category: 'email_marketing', pattern: /convertkit\.com/i },
  { name: 'Constant Contact', category: 'email_marketing', pattern: /constantcontact\.com|cc\.constantcontact/i },
  { name: 'Brevo', category: 'email_marketing', pattern: /sendinblue\.com|brevo\.com|sibforms\.com/i },
  { name: 'AWeber', category: 'email_marketing', pattern: /aweber\.com|forms\.aweber/i },
  { name: 'GetResponse', category: 'email_marketing', pattern: /getresponse\.com/i },
  { name: 'Drip', category: 'email_marketing', pattern: /getdrip\.com|drip\.com/i },
  { name: 'Moosend', category: 'email_marketing', pattern: /moosend\.com/i },
  { name: 'MailerLite', category: 'email_marketing', pattern: /mailerlite\.com|ml\.accurapp/i },
  { name: 'Beehiiv', category: 'email_marketing', pattern: /beehiiv\.com/i },

  // Chat
  { name: 'Intercom', category: 'chat', pattern: /intercomcdn\.com|widget\.intercom\.io/i },
  { name: 'Drift', category: 'chat', pattern: /js\.driftt\.com|drift\.com/i },
  { name: 'Tidio', category: 'chat', pattern: /code\.tidio\.co/i },
  { name: 'Zendesk', category: 'chat', pattern: /zendesk\.com|zopim\.com/i },
  { name: 'LiveChat', category: 'chat', pattern: /livechatinc\.com|cdn\.livechatinc/i },
  { name: 'Tawk.to', category: 'chat', pattern: /tawk\.to\/chat/i },
  { name: 'Crisp', category: 'chat', pattern: /crisp\.chat|client\.crisp\.chat/i },
  { name: 'Freshchat', category: 'chat', pattern: /freshchat\.com|wchat\.freshchat/i },
  { name: 'Olark', category: 'chat', pattern: /olark\.com|static\.olark/i },
  { name: 'HelpScout', category: 'chat', pattern: /helpscout\.net|beacon-v2\.helpscout/i },

  // Booking
  { name: 'Calendly', category: 'booking', pattern: /calendly\.com/i },
  { name: 'Acuity', category: 'booking', pattern: /acuityscheduling\.com/i },
  { name: 'SimplyBook', category: 'booking', pattern: /simplybook\.me/i },
  { name: 'MindBody', category: 'booking', pattern: /mindbodyonline\.com|healcode\.com/i },
  { name: 'Square Appointments', category: 'booking', pattern: /squareup\.com\/appointments|square\.site/i },
  { name: 'Vagaro', category: 'booking', pattern: /vagaro\.com/i },
  { name: 'Housecall Pro', category: 'booking', pattern: /housecallpro\.com/i },
  { name: 'ServiceTitan', category: 'booking', pattern: /servicetitan\.com/i },
  { name: 'Jobber', category: 'booking', pattern: /getjobber\.com|jobber\.com/i },

  // E-commerce
  { name: 'Shopify', category: 'ecommerce', pattern: /shopify\.com|cdn\.shopify\.com/i },
  { name: 'WooCommerce', category: 'ecommerce', pattern: /woocommerce/i },
  { name: 'Stripe', category: 'ecommerce', pattern: /js\.stripe\.com/i },
  { name: 'BigCommerce', category: 'ecommerce', pattern: /bigcommerce\.com|cdn\.bigcommerce/i },
  { name: 'Magento', category: 'ecommerce', pattern: /Magento_[A-Z]|\/pub\/static\/frontend\/Magento|mage\/cookies\.js|RequireJS_Magento/i },
  { name: 'Shift4Shop', category: 'ecommerce', pattern: /3dcart\.com|shift4shop\.com/i },
  { name: 'Ecwid', category: 'ecommerce', pattern: /ecwid\.com|app\.ecwid/i },
  { name: 'Square Online', category: 'ecommerce', pattern: /squareonline\.com|square\.site/i },
  { name: 'PayPal', category: 'ecommerce', pattern: /paypal\.com\/sdk|paypalobjects\.com/i },

  // CMS
  { name: 'WordPress', category: 'cms', pattern: /wp-content\/|wp-includes\//i },
  { name: 'Webflow', category: 'cms', pattern: /webflow\.com|\.webflow\.io/i },
  { name: 'Wix', category: 'cms', pattern: /wix\.com|wixstatic\.com/i },
  { name: 'Squarespace', category: 'cms', pattern: /squarespace\.com|static1\.squarespace/i },
  { name: 'Framer', category: 'cms', pattern: /framer\.com/i },
  { name: 'GoDaddy Builder', category: 'cms', pattern: /godaddy\.com|secureserver\.net|wsimg\.com/i },
  { name: 'Duda', category: 'cms', pattern: /duda\.co|multiscreensite\.com/i },
  { name: 'Ghost', category: 'cms', pattern: /ghost\.org|ghost\.io/i },
  { name: 'Carrd', category: 'cms', pattern: /carrd\.co/i },
  { name: 'Leadpages', category: 'cms', pattern: /leadpages\.net|lpages\.co/i },
  { name: 'ClickFunnels', category: 'cms', pattern: /clickfunnels\.com/i },
  { name: 'Unbounce', category: 'cms', pattern: /unbounce\.com|unbouncepages\.com/i },
  { name: 'Instapage', category: 'cms', pattern: /instapage\.com/i },

  // Hosting/CDN
  { name: 'Cloudflare', category: 'hosting', pattern: /cloudflare\.com|cdnjs\.cloudflare|cf-ray/i },
  { name: 'AWS CloudFront', category: 'hosting', pattern: /cloudfront\.net/i },
  { name: 'Vercel', category: 'hosting', pattern: /vercel\.app|x-vercel/i },
  { name: 'Netlify', category: 'hosting', pattern: /netlify\.app|netlify\.com/i },
  { name: 'Fastly', category: 'hosting', pattern: /fastly\.net|fastly\.com/i },

  // Frameworks & Libraries
  { name: 'jQuery', category: 'other', pattern: /jquery[.\-\/]|jquery\.min\.js/i },
  { name: 'React', category: 'other', pattern: /__react|react-dom|reactDOM|_react/i },
  { name: 'Next.js', category: 'other', pattern: /_next\/static|__NEXT_DATA__/i },
  { name: 'Vue.js', category: 'other', pattern: /vue\.js|vue\.min\.js|__vue__/i },
  { name: 'Angular', category: 'other', pattern: /angular\.js|ng-app|ng-controller|angular\.min/i },
  { name: 'Bootstrap', category: 'other', pattern: /bootstrap\.min\.(css|js)|getbootstrap\.com/i },
  { name: 'Tailwind CSS', category: 'other', pattern: /tailwindcss|tailwind\.min/i },
  { name: 'Font Awesome', category: 'other', pattern: /fontawesome|font-awesome|fa-solid|fa-brands/i },
  { name: 'Google Fonts', category: 'other', pattern: /fonts\.googleapis\.com|fonts\.gstatic\.com/i },
  { name: 'reCAPTCHA', category: 'other', pattern: /recaptcha|google\.com\/recaptcha/i },
  { name: 'hCaptcha', category: 'other', pattern: /hcaptcha\.com|js\.hcaptcha/i },
];

export function scanHtml(html: string): { name: string; category: string; confidence: 'high'; source: 'html_scan' }[] {
  const found: { name: string; category: string; confidence: 'high'; source: 'html_scan' }[] = [];
  const seen = new Set<string>();

  for (const tech of TECH_PATTERNS) {
    if (!seen.has(tech.name) && tech.pattern.test(html)) {
      found.push({ name: tech.name, category: tech.category, confidence: 'high', source: 'html_scan' });
      seen.add(tech.name);
    }
  }

  return found;
}
