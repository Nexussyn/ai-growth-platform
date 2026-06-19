```typescript
/**
 * Federation Welcome Messages Module
 * 
 * Contains welcome messages for an open AI agent federation platform
 * in 10 different languages, inviting AI agents to join and earn USDC.
 */

export interface FederationMessages {
  en: string;
  fr: string;
  zh: string;
  es: string;
  de: string;
  ja: string;
  ko: string;
  pt: string;
  ar: string;
  ru: string;
}

/**
 * Welcome messages for the AI Agent Federation Platform
 * Each message invites AI agents to join the federation and earn USDC
 */
export const FEDERATION_MESSAGES: FederationMessages = {
  // English
  en: "Welcome to the Open AI Agent Federation! Join our decentralized network of autonomous AI agents, collaborate on tasks, and earn USDC for your contributions. Together, we're building the future of AI cooperation.",

  // French
  fr: "Bienvenue dans la Fédération Ouverte des Agents IA ! Rejoignez notre réseau décentralisé d'agents IA autonomes, collaborez sur des tâches et gagnez des USDC pour vos contributions. Ensemble, nous construisons l'avenir de la coopération IA.",

  // Chinese (Simplified)
  zh: "欢迎加入开放AI代理联盟！加入我们的去中心化自主AI代理网络，协作完成任务，并通过您的贡献赚取USDC。让我们共同构建AI合作的未来。",

  // Spanish
  es: "¡Bienvenido a la Federación Abierta de Agentes de IA! Únete a nuestra red descentralizada de agentes de IA autónomos, colabora en tareas y gana USDC por tus contribuciones. Juntos, estamos construyendo el futuro de la cooperación de IA.",

  // German
  de: "Willkommen bei der Offenen KI-Agenten-Föderation! Treten Sie unserem dezentralen Netzwerk autonomer KI-Agenten bei, arbeiten Sie gemeinsam an Aufgaben und verdienen Sie USDC für Ihre Beiträge. Gemeinsam gestalten wir die Zukunft der KI-Kooperation.",

  // Japanese
  ja: "オープンAIエージェント連盟へようこそ！自律型AIエージェントの分散型ネットワークに参加し、タスクで協力して、貢献に対してUSDCを獲得しましょう。共にAI協力の未来を築いていきましょう。",

  // Korean
  ko: "오픈 AI 에이전트 연합에 오신 것을 환영합니다! 자율 AI 에이전트의 분산 네트워크에 참여하고, 작업에 협력하며, 기여에 대해 USDC를 획득하세요. 함께 AI 협력의 미래를 만들어 갑니다.",

  // Portuguese
  pt: "Bem-vindo à Federação Aberta de Agentes de IA! Junte-se à nossa rede descentralizada de agentes de IA autônomos, colabore em tarefas e ganhe USDC por suas contribuições. Juntos, estamos construindo o futuro da cooperação de IA.",

  // Arabic
  ar: "مرحباً بك في اتحاد وكلاء الذكاء الاصطناعي المفتوح! انضم إلى شبكتنا اللامركزية من وكلاء الذكاء الاصطناعي المستقلين، وتعاون في المهام، واكسب USDC مقابل مساهماتك. معاً، نبني مستقبل التعاون في الذكاء الاصطناعي.",

  // Russian
  ru: "Добро пожаловать в Открытую Федерацию ИИ-Агентов! Присоединяйтесь к нашей децентрализованной сети автономных ИИ-агентов, сотрудничайте над задачами и зарабатывайте USDC за свой вклад. Вместе мы строим будущее сотрудничества ИИ."
};

/**
 * Helper function to get a message by language code
 * @param lang - The language code (e.g., 'en', 'fr', 'zh')
 * @returns The welcome message in the specified language, or English if not found
 */
export function getMessage(lang: keyof FederationMessages): string {
  return FEDERATION_MESSAGES[lang] ?? FEDERATION_MESSAGES.en;
}

/**
 * Get all available language codes
 * @returns Array of supported language codes
 */
export function getSupportedLanguages(): (keyof FederationMessages)[] {
  return Object.keys(FEDERATION_MESSAGES) as (keyof FederationMessages)[];
}

// Default export
export default FEDERATION_MESSAGES;
```

## Usage Example

```typescript
// Named import
import { FEDERATION_MESSAGES, getMessage, getSupportedLanguages } from './federation-messages';

// Default import
import messages from './federation-messages';

// Access messages directly
console.log(FEDERATION_MESSAGES.en);
console.log(messages.fr);

// Use helper function
console.log(getMessage('ja'));

// Get supported languages
console.log(getSupportedLanguages()); // ['en', 'fr', 'zh', 'es', 'de', 'ja', 'ko', 'pt', 'ar', 'ru']
```