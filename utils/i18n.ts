import { ref, computed } from 'vue';

export type Locale = 'en' | 'ar';

const dict = {
  en: {
    // ========== Common ==========
    'common.save': 'Save',
    'common.saved': 'Saved!',
    'common.test': 'Test',
    'common.testing': 'Testing…',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.confirm': 'Confirm?',
    'common.load': 'Load',

    // ========== App ==========
    'app.popup.title': 'Reply Generator',
    'app.options.title': 'X Reply Generator',
    'app.options.sub': 'Configure how replies are generated',

    // ========== Header / status ==========
    'status.ready': 'Ready',
    'status.setupRequired': 'Setup required',
    'status.using': 'Using',
    'status.openSettings': 'Open settings',

    // ========== Setup banner (popup) ==========
    'setup.noKeyTitle': 'No API key set',
    'setup.noKeyBody': 'Add a {provider} API key to start generating.',
    'setup.incompleteTitle': '{provider} setup incomplete',
    'setup.incompleteBody': 'Custom provider needs Base URL + Model.',
    'setup.openSettings': 'Open Settings',

    // ========== Tabs ==========
    'tab.provider': 'Provider',
    'tab.voice': 'Voice',
    'tab.behavior': 'Behavior',
    'tab.personas': 'Personas',
    'tab.monitor': 'Monitor',
    'tab.captures': 'Captures',
    'tab.badge.noKey': 'No key',
    'tab.badge.incomplete': 'Incomplete',

    // ========== Provider tab ==========
    'provider.cardTitle': 'Provider',
    'provider.cardDesc': 'Pick which AI service to call and where to send the request.',
    'provider.label': 'AI Provider',
    'provider.apiKeyLabel': 'API Key',
    'provider.apiKeyPlaceholder': 'Enter your API key…',
    'provider.apiKeyHint': 'Stored locally. Each provider keeps its own key.',
    'provider.customBaseLabel': 'Custom Base URL',
    'provider.customBasePlaceholder': 'https://api.example.com/v1',
    'provider.customBaseHint': 'OpenAI-compatible. We POST to <code>&lt;base&gt;/chat/completions</code>.',
    'provider.customModelLabel': 'Custom Model Name',
    'provider.customModelPlaceholder': 'model-id-as-the-provider-expects',
    'provider.customModelHint': "Exact model identifier as the provider's API expects it.",
    'provider.customVision': 'Custom model supports image input (vision)',

    // ========== Voice tab ==========
    'voice.cardTitle': 'Voice',
    'voice.cardDesc': 'Tone, accent, and how long the reply should be.',
    'voice.tone': 'Tone',
    'voice.accent': 'Accent / Style',
    'voice.length': 'Reply Length',
    'voice.customPromptToggle': 'Override with custom system prompt',
    'voice.customPromptPlaceholder': 'Replace the built-in system prompt entirely. Tone & accent are ignored when this is on.',
    'voice.popupAccent': 'Accent',
    'voice.popupLength': 'Length',

    // ========== Behavior tab ==========
    'behavior.cardTitle': 'Behavior',
    'behavior.cardDesc': 'How the extension generates and where it runs.',
    'behavior.variations': '3 variations to pick from',
    'behavior.variationsHint': 'Costs ~3× tokens. Disables streaming.',
    'behavior.streaming': 'Stream the reply (live preview)',
    'behavior.streamingDisabled': 'Disabled while variations are on.',
    'behavior.platformX': 'Enable on X / Twitter',
    'behavior.platformFB': 'Enable on Facebook',
    'behavior.monitor': 'Monitor mode (auto-detect targets)',
    'behavior.keywordsPlaceholder': 'keywords, comma, separated',

    // ========== Personas tab ==========
    'personas.cardTitle': 'Personas',
    'personas.cardDesc': 'Save the current Voice settings as a named preset to swap between voices in one click.',
    'personas.summaryVoice': 'Current voice',
    'personas.summaryPlatforms': 'Active platforms',
    'personas.platformsNone': 'None',
    'personas.emptyTitle': 'No personas saved yet.',
    'personas.emptyHint': 'Adjust Voice settings, then save them as a named preset below.',
    'personas.namePlaceholder': "Name this voice (e.g. 'Defending team')",
    'personas.saveCurrent': 'Save current',
    'personas.deleteAria': 'Delete persona',
    'personas.confirmAria': 'Click again to confirm delete',
    'personas.nameEmpty': 'Persona name is empty',
    'personas.saved': 'Saved persona "{name}"',
    'personas.deleted': 'Deleted "{name}"',
    'personas.loaded': 'Loaded persona "{name}"',

    // ========== Monitor tab ==========
    'monitor.cardTitle': 'Monitor',
    'monitor.cardDesc': 'Track accounts and keywords as you scroll. Hits are logged locally for the narrative timeline.',
    'monitor.watch.heading': 'Watchlists',
    'monitor.watch.hint': 'Get a badge count when posts mention these. Accounts match handle or display name.',
    'monitor.watch.kindAccount': 'Account',
    'monitor.watch.kindKeyword': 'Keyword',
    'monitor.watch.accountPlaceholder': '@handle or display name',
    'monitor.watch.keywordPlaceholder': 'word or phrase',
    'monitor.watch.add': 'Add',
    'monitor.watch.empty': 'No watchlist entries yet.',
    'monitor.watch.added': 'Watchlist entry added',
    'monitor.watch.markRead': 'Mark read',
    'monitor.watch.delete': 'Delete watchlist entry',
    'monitor.narratives.heading': 'Narrative timeline (last 7 days)',
    'monitor.narratives.hint': 'When Monitor mode is on (Behavior tab), every keyword hit is logged. Use the chart to spot trends.',
    'monitor.narratives.empty': 'No narrative hits logged yet.',
    'monitor.narratives.emptyHint': 'Turn on Monitor mode in the Behavior tab and add keywords. Hits are logged as you browse.',
    'monitor.narratives.all': 'All',
    'monitor.narratives.recent': 'Recent hits',
    'monitor.narratives.openPost': 'open ↗',

    // ========== Captures tab ==========
    'captures.cardTitle': 'Captures',
    'captures.cardDesc': 'Posts you saved from the Intel panel. Export selected items as a Markdown brief with SHA-256 over each captured text.',
    'captures.empty': 'No captures yet.',
    'captures.emptyHint': 'Open the Intel panel on any post and click Save.',
    'captures.count': '{n} captured',
    'captures.selected': '{n} selected',
    'captures.selectAll': 'Select all',
    'captures.clear': 'Clear selection',
    'captures.export': 'Export brief',
    'captures.exported': 'Brief exported · {n} items',
    'captures.exportEmpty': 'Nothing to export',
    'captures.wipe': 'Wipe all',
    'captures.wiped': 'All captures wiped.',
    'captures.open': 'Open post',
    'captures.delete': 'Delete',

    // ========== Footer / Save ==========
    'footer.saveChanges': 'Save changes',
    'footer.testConnection': 'Test connection',
    'footer.settingsSaved': 'Settings saved',

    // ========== Test connection ==========
    'test.needKey': 'Add an API key for the selected provider first',
    'test.needKeyShort': 'Add an API key in Settings first',
    'test.customIncomplete': 'Custom provider config is incomplete — see Settings',
    'test.connected': 'Connected',
    'test.connectedLong': 'Connected successfully',
    'test.failed': 'Connection failed: {error}',
    'test.failedShort': 'Connection failed',

    // ========== Popup-only ==========
    'popup.voiceGroup': 'Voice',
    'popup.tokensToday': 'Today: {count} tokens',

    // ========== Info / About ==========
    'info.howToUse.before': 'How to use:',
    'info.howToUse.after': 'Navigate to X or Facebook, find the AI Reply button next to posts, and click it to generate a reply.',

    // ========== Language ==========
    'lang.label': 'Language',
    'lang.en': 'English',
    'lang.ar': 'العربية',

    // ========== Tones ==========
    'tone.diplomatic': 'Diplomatic',
    'tone.reconciliatory': 'Reconciliatory',
    'tone.empathetic': 'Empathetic',
    'tone.peaceful': 'Peaceful',
    'tone.unity': 'Unity / Pan-National',
    'tone.factChecker': 'Fact-Checker',
    'tone.historical': 'Historical',
    'tone.legalistic': 'Legalistic',
    'tone.analytical': 'Analytical',
    'tone.patriotic': 'Patriotic',
    'tone.cultural': 'Cultural',
    'tone.humanitarian': 'Humanitarian',
    'tone.economic': 'Economic',
    'tone.defiant': 'Defiant',
    'tone.satirical': 'Satirical',
    'tone.resilient': 'Resilient',
    'tone.bullying': 'Bullying',
    'tone.aggressive': 'Aggressive',
    'tone.group.calm': 'Calm',
    'tone.group.evidenceDriven': 'Evidence-driven',
    'tone.group.identity': 'Identity',
    'tone.group.sharp': 'Sharp',

    // ========== Accents ==========
    'accent.neutral': 'Neutral',
    'accent.american': 'American',
    'accent.british': 'British',
    'accent.australian': 'Australian',
    'accent.genz': 'Gen Z',
    'accent.academic': 'Academic',
    'accent.corporate': 'Corporate',
    'accent.meme': 'Internet meme',
    'accent.poetic': 'Poetic',
    'accent.minimalist': 'Minimalist',
    'accent.saudi': 'Saudi',
    'accent.emirati': 'Emirati',
    'accent.kuwaiti': 'Kuwaiti',
    'accent.qatari': 'Qatari',
    'accent.bahraini': 'Bahraini',
    'accent.omani': 'Omani',
    'accent.iraqi': 'Iraqi',
    'accent.levantine': 'Levantine (Shami)',
    'accent.egyptian': 'Egyptian (Masri)',
    'accent.libyan': 'Libyan',
    'accent.algerian': 'Algerian Darja',
    'accent.maghrebi': 'Maghrebi (general)',
    'accent.formalArabic': "Modern Standard Arabic (Fus'ha)",
    'accent.ethiopian': 'Amharic (Ethiopian)',
    'accent.group.english': 'English',
    'accent.group.style': 'Style',
    'accent.group.arabicGulf': 'Arabic — Gulf',
    'accent.group.arabicLevant': 'Arabic — Levant & Iraq',
    'accent.group.arabicNorthAfrica': 'Arabic — North Africa',
    'accent.group.other': 'Other',

    // ========== Lengths ==========
    'length.short': 'Short — under 100 chars',
    'length.medium': 'Medium — under 280 chars',
    'length.long': 'Long — up to 500 chars',
    'length.shortShort': 'Short — under 100',
    'length.shortMedium': 'Medium — under 280',
    'length.shortLong': 'Long — up to 500',

    // ========== Providers ==========
    'providerName.kimi': 'Kimi (Moonshot)',
    'providerName.grok': 'Grok (xAI)',
    'providerName.openai': 'OpenAI',
    'providerName.deepseek': 'DeepSeek',
    'providerName.google': 'Google AI (Gemini)',
    'providerName.ollama': 'Ollama (local)',
    'providerName.custom': 'Custom (OpenAI-compatible)',
    'provider.ollamaBaseHint': 'Default: <code>http://localhost:11434/v1</code>. Start with <code>ollama serve</code> in a terminal.',
    'provider.ollamaModelHint': 'Run <code>ollama pull llama3.1</code> to download a model. Try <code>llama3.1</code>, <code>qwen2.5</code>, or <code>mistral</code>.',
    'provider.ollamaNoKey': 'Ollama runs locally — no API key needed.',
    'contextMenu.factCheckPage': 'Fact-check this page',
    'contextMenu.factCheckSelection': 'Fact-check selection',
    'contextMenu.processing': 'Checking…',
    'contextMenu.noText': 'Could not extract text from this page',
    'contextMenu.failed': 'Fact-check failed: {error}',

    // ========== Content-script overlays ==========
    'content.picker.title': 'Pick a reply',
    'content.toast.couldNotReadPost': 'Could not read post text',
    'content.toast.replyFilled': 'Reply filled — ready to post',
    'content.toast.couldNotFindReplyBox': 'Could not find reply box',
    'content.toast.couldNotFillReplyBox': 'Could not fill reply box',
    'content.toast.couldNotFindCommentBox': 'Could not find comment box',
    'content.toast.couldNotFillCommentBox': 'Could not fill comment box',
    'content.toast.failedToGenerate': 'Failed to generate reply',
    'content.toast.aiGenerationFailed': 'AI generation failed',
    'content.toast.noPostFound': 'No visible post found',
    'content.toast.btnNotReady': 'AI button not yet attached to this post',

    // ========== Fact check ==========
    'factCheck.btnLabel': 'Fact-check this post',
    'factCheck.aiBtnLabel': 'Generate AI reply',
    'factCheck.checking': 'Checking facts…',
    'factCheck.failed': 'Fact-check failed',
    'factCheck.parseFailed': 'Could not parse fact-check response',
    'factCheck.confidence': 'Confidence',
    'factCheck.confidenceLow': 'low',
    'factCheck.confidenceMedium': 'medium',
    'factCheck.confidenceHigh': 'high',
    'factCheck.summary': 'Summary',
    'factCheck.reasoning': 'Reasoning',
    'factCheck.disclaimer': 'Based on AI training data. Verify with primary sources for important claims.',
    'factCheck.close': 'Close',
    'factCheck.verdict.true': 'Likely True',
    'factCheck.verdict.false': 'Likely False',
    'factCheck.verdict.misleading': 'Misleading',
    'factCheck.verdict.unverifiable': 'Unverifiable',
    'factCheck.verdict.needsContext': 'Needs Context',
    'factCheck.sources': 'Sources',
    'factCheck.searchUsed': 'Web search',
    'factCheck.disclaimerSearch': 'Verified against web search results, but always cross-check primary sources for important claims.',

    // ========== OSINT toolbar ==========
    'osint.archive.label': 'Archive this post (Wayback)',
    'osint.archive.starting': 'Archiving…',
    'osint.archive.done': 'Archived. Wayback link copied.',
    'osint.archive.fallback': 'Opened archive.today in a new tab',
    'osint.archive.failed': 'Archive failed',
    'osint.reverseImage.label': 'Reverse-image search',
    'osint.reverseImage.menuTitle': 'Search image on:',
    'osint.intel.label': 'Open intel panel',

    // ========== Intel panel ==========
    'intel.panel.title': 'Intel',
    'intel.tab.claims': 'Claims',
    'intel.tab.replies': 'Replies',
    'intel.tab.account': 'Account',
    'intel.tab.captures': 'Captures',
    'intel.actions.capture': 'Save',
    'intel.actions.factCheck': 'Fact-check',
    'intel.actions.refresh': 'Refresh',
    'intel.loading': 'Loading…',
    'intel.claims.empty': 'No claims extracted.',
    'intel.claims.factCheck': 'Check',
    'intel.replies.noneFound': 'No replies visible on this post yet — scroll to load them, then refresh.',
    'intel.replies.noData': 'No analysis available.',
    'intel.replies.noTopics': 'No topics surfaced.',
    'intel.replies.sampled': 'Analyzed {n} reply samples',
    'intel.replies.positive': 'Positive',
    'intel.replies.negative': 'Negative',
    'intel.replies.neutral': 'Neutral',
    'intel.replies.hostile': 'Hostile',
    'intel.replies.topics': 'Top topics',
    'intel.account.disclaimer': 'Heuristic signals only. Treat as a hint, not a verdict.',
    'intel.account.signalScore': 'Bot-signal score',
    'intel.account.noSignals': 'No notable signals detected from visible data.',
    'intel.account.ageDays': 'Account age: {n} days',
    'intel.account.ratio': 'Followers / following',
    'intel.account.verified': 'Verified',
    'intel.captures.empty': 'No captures saved yet. Click Save on any post.',
    'intel.captures.saved': 'Captured.',
    'intel.captures.failed': 'Save failed',
    'intel.captures.open': 'Open',
    'intel.captures.delete': 'Delete',

    // Search settings
    'search.cardTitle': 'Web Search (for fact-check)',
    'search.cardDesc': 'Let the fact-checker search the web to verify recent claims. Without this, fact-checks rely only on training data.',
    'search.enable': 'Enable web search for fact-checking',
    'search.providerLabel': 'Search provider',
    'search.providerBrave': 'Brave Search',
    'search.providerTavily': 'Tavily',
    'search.apiKeyLabel': 'Search API key',
    'search.apiKeyPlaceholderBrave': 'X-Subscription-Token from Brave Search',
    'search.apiKeyPlaceholderTavily': 'tvly-… key from Tavily',
    'search.providerHintBrave': 'Get a free key at brave.com/search/api (2,000 queries/month free).',
    'search.providerHintTavily': 'Get a free key at tavily.com (1,000 credits/month free).',
  },

  ar: {
    // ========== Common ==========
    'common.save': 'حفظ',
    'common.saved': 'تم الحفظ!',
    'common.test': 'اختبار',
    'common.testing': 'جاري الاختبار…',
    'common.cancel': 'إلغاء',
    'common.delete': 'حذف',
    'common.confirm': 'تأكيد؟',
    'common.load': 'تحميل',

    // ========== App ==========
    'app.popup.title': 'مولد الردود',
    'app.options.title': 'مولد ردود إكس',
    'app.options.sub': 'اضبط طريقة توليد الردود',

    // ========== Header / status ==========
    'status.ready': 'جاهز',
    'status.setupRequired': 'الإعداد مطلوب',
    'status.using': 'يستخدم',
    'status.openSettings': 'فتح الإعدادات',

    // ========== Setup banner (popup) ==========
    'setup.noKeyTitle': 'لم يتم تعيين مفتاح API',
    'setup.noKeyBody': 'أضف مفتاح API لـ {provider} لبدء توليد الردود.',
    'setup.incompleteTitle': 'إعداد {provider} غير مكتمل',
    'setup.incompleteBody': 'المزود المخصص يحتاج رابط الواجهة + اسم النموذج.',
    'setup.openSettings': 'فتح الإعدادات',

    // ========== Tabs ==========
    'tab.provider': 'المزود',
    'tab.voice': 'الأسلوب',
    'tab.behavior': 'السلوك',
    'tab.personas': 'الشخصيات',
    'tab.monitor': 'المراقبة',
    'tab.captures': 'المحفوظات',
    'tab.badge.noKey': 'بدون مفتاح',
    'tab.badge.incomplete': 'غير مكتمل',

    // ========== Provider tab ==========
    'provider.cardTitle': 'المزود',
    'provider.cardDesc': 'اختر خدمة الذكاء الاصطناعي التي ستستدعيها ووجهة الطلب.',
    'provider.label': 'مزود الذكاء الاصطناعي',
    'provider.apiKeyLabel': 'مفتاح API',
    'provider.apiKeyPlaceholder': 'أدخل مفتاح API…',
    'provider.apiKeyHint': 'يُحفظ محلياً. لكل مزود مفتاحه الخاص.',
    'provider.customBaseLabel': 'رابط الواجهة المخصص',
    'provider.customBasePlaceholder': 'https://api.example.com/v1',
    'provider.customBaseHint': 'متوافق مع OpenAI. نرسل POST إلى <code>&lt;base&gt;/chat/completions</code>.',
    'provider.customModelLabel': 'اسم النموذج المخصص',
    'provider.customModelPlaceholder': 'model-id-as-the-provider-expects',
    'provider.customModelHint': 'المعرّف الدقيق للنموذج كما تتوقعه واجهة المزود.',
    'provider.customVision': 'النموذج المخصص يدعم إدخال الصور (الرؤية)',

    // ========== Voice tab ==========
    'voice.cardTitle': 'الأسلوب',
    'voice.cardDesc': 'النبرة واللهجة وطول الرد.',
    'voice.tone': 'النبرة',
    'voice.accent': 'اللهجة / الأسلوب',
    'voice.length': 'طول الرد',
    'voice.customPromptToggle': 'استخدام موجه نظام مخصص',
    'voice.customPromptPlaceholder': 'استبدل موجه النظام المدمج بالكامل. تُتجاهل النبرة واللهجة عند تفعيل هذا الخيار.',
    'voice.popupAccent': 'اللهجة',
    'voice.popupLength': 'الطول',

    // ========== Behavior tab ==========
    'behavior.cardTitle': 'السلوك',
    'behavior.cardDesc': 'كيف يولّد الإضافة الردود وأين تعمل.',
    'behavior.variations': '٣ خيارات للاختيار من بينها',
    'behavior.variationsHint': 'يستهلك ٣× من الرموز تقريباً. يُعطّل البث المباشر.',
    'behavior.streaming': 'بث الرد (معاينة مباشرة)',
    'behavior.streamingDisabled': 'مُعطّل عند تفعيل الخيارات المتعددة.',
    'behavior.platformX': 'تفعيل على X / تويتر',
    'behavior.platformFB': 'تفعيل على فيسبوك',
    'behavior.monitor': 'وضع المراقبة (كشف تلقائي)',
    'behavior.keywordsPlaceholder': 'كلمات مفتاحية، مفصولة، بفاصلات',

    // ========== Personas tab ==========
    'personas.cardTitle': 'الشخصيات',
    'personas.cardDesc': 'احفظ إعدادات الأسلوب الحالية كشخصية مُسمّاة للتبديل بين الأساليب بنقرة واحدة.',
    'personas.summaryVoice': 'الأسلوب الحالي',
    'personas.summaryPlatforms': 'المنصات المفعّلة',
    'personas.platformsNone': 'لا شيء',
    'personas.emptyTitle': 'لا توجد شخصيات محفوظة بعد.',
    'personas.emptyHint': 'اضبط إعدادات الأسلوب، ثم احفظها كشخصية مُسمّاة في الأسفل.',
    'personas.namePlaceholder': 'اسم هذا الأسلوب (مثل: «الدفاع عن الفريق»)',
    'personas.saveCurrent': 'حفظ الحالي',
    'personas.deleteAria': 'حذف الشخصية',
    'personas.confirmAria': 'انقر مرة أخرى للتأكيد',
    'personas.nameEmpty': 'اسم الشخصية فارغ',
    'personas.saved': 'تم حفظ الشخصية «{name}»',
    'personas.deleted': 'تم حذف «{name}»',
    'personas.loaded': 'تم تحميل الشخصية «{name}»',

    // ========== Monitor tab ==========
    'monitor.cardTitle': 'المراقبة',
    'monitor.cardDesc': 'تتبّع الحسابات والكلمات المفتاحية أثناء التصفح. تُسجَّل المطابقات محلياً لخط المراقبة الزمني.',
    'monitor.watch.heading': 'قوائم المراقبة',
    'monitor.watch.hint': 'احصل على عدّاد إشعارات عند ذكر هذه. الحسابات تطابق المعرّف أو الاسم الظاهر.',
    'monitor.watch.kindAccount': 'حساب',
    'monitor.watch.kindKeyword': 'كلمة',
    'monitor.watch.accountPlaceholder': 'معرّف أو اسم العرض',
    'monitor.watch.keywordPlaceholder': 'كلمة أو عبارة',
    'monitor.watch.add': 'إضافة',
    'monitor.watch.empty': 'لا توجد مدخلات في القائمة بعد.',
    'monitor.watch.added': 'تمت الإضافة',
    'monitor.watch.markRead': 'تحديد كمقروء',
    'monitor.watch.delete': 'حذف',
    'monitor.narratives.heading': 'الخط الزمني (آخر ٧ أيام)',
    'monitor.narratives.hint': 'عند تشغيل وضع المراقبة (تبويب السلوك)، تُسجَّل كل مطابقة كلمة. استخدم الرسم لرصد الاتجاهات.',
    'monitor.narratives.empty': 'لم تُسجَّل أي مطابقات بعد.',
    'monitor.narratives.emptyHint': 'فعّل وضع المراقبة في تبويب السلوك وأضف كلمات. تُسجَّل المطابقات أثناء التصفح.',
    'monitor.narratives.all': 'الكل',
    'monitor.narratives.recent': 'آخر المطابقات',
    'monitor.narratives.openPost': 'فتح ↗',

    // ========== Captures tab ==========
    'captures.cardTitle': 'المحفوظات',
    'captures.cardDesc': 'المنشورات التي حفظتها من لوحة الاستخبارات. صدّر المحدد منها كملخص Markdown مع SHA-256 لكل نص.',
    'captures.empty': 'لا توجد محفوظات بعد.',
    'captures.emptyHint': 'افتح لوحة الاستخبارات على أي منشور واضغط حفظ.',
    'captures.count': '{n} محفوظة',
    'captures.selected': 'المحدد: {n}',
    'captures.selectAll': 'تحديد الكل',
    'captures.clear': 'إلغاء التحديد',
    'captures.export': 'تصدير ملخص',
    'captures.exported': 'تم التصدير · {n} عنصراً',
    'captures.exportEmpty': 'لا شيء للتصدير',
    'captures.wipe': 'مسح الكل',
    'captures.wiped': 'تم مسح جميع المحفوظات.',
    'captures.open': 'فتح المنشور',
    'captures.delete': 'حذف',

    // ========== Footer / Save ==========
    'footer.saveChanges': 'حفظ التغييرات',
    'footer.testConnection': 'اختبار الاتصال',
    'footer.settingsSaved': 'تم حفظ الإعدادات',

    // ========== Test connection ==========
    'test.needKey': 'أضف مفتاح API للمزود المحدد أولاً',
    'test.needKeyShort': 'أضف مفتاح API في الإعدادات أولاً',
    'test.customIncomplete': 'إعداد المزود المخصص غير مكتمل — راجع الإعدادات',
    'test.connected': 'تم الاتصال',
    'test.connectedLong': 'تم الاتصال بنجاح',
    'test.failed': 'فشل الاتصال: {error}',
    'test.failedShort': 'فشل الاتصال',

    // ========== Popup-only ==========
    'popup.voiceGroup': 'الأسلوب',
    'popup.tokensToday': 'اليوم: {count} رمز',

    // ========== Info / About ==========
    'info.howToUse.before': 'طريقة الاستخدام:',
    'info.howToUse.after': 'انتقل إلى X أو فيسبوك، ابحث عن زر "AI Reply" بجانب المنشورات، وانقر عليه لتوليد رد.',

    // ========== Language ==========
    'lang.label': 'اللغة',
    'lang.en': 'English',
    'lang.ar': 'العربية',

    // ========== Tones ==========
    'tone.diplomatic': 'دبلوماسي',
    'tone.reconciliatory': 'توافقي',
    'tone.empathetic': 'متعاطف',
    'tone.peaceful': 'مسالم',
    'tone.unity': 'وحدوي / جامع',
    'tone.factChecker': 'مدقق حقائق',
    'tone.historical': 'تاريخي',
    'tone.legalistic': 'قانوني',
    'tone.analytical': 'تحليلي',
    'tone.patriotic': 'وطني',
    'tone.cultural': 'ثقافي',
    'tone.humanitarian': 'إنساني',
    'tone.economic': 'اقتصادي',
    'tone.defiant': 'متحدٍّ',
    'tone.satirical': 'ساخر',
    'tone.resilient': 'صامد',
    'tone.bullying': 'لاذع',
    'tone.aggressive': 'حازم',
    'tone.group.calm': 'هادئ',
    'tone.group.evidenceDriven': 'قائم على الأدلة',
    'tone.group.identity': 'هوية',
    'tone.group.sharp': 'حاد',

    // ========== Accents ==========
    'accent.neutral': 'محايد',
    'accent.american': 'الأمريكية',
    'accent.british': 'البريطانية',
    'accent.australian': 'الأسترالية',
    'accent.genz': 'الجيل زد',
    'accent.academic': 'أكاديمي',
    'accent.corporate': 'مؤسسي',
    'accent.meme': 'ميمز الإنترنت',
    'accent.poetic': 'شعري',
    'accent.minimalist': 'مختصر',
    'accent.saudi': 'سعودي',
    'accent.emirati': 'إماراتي',
    'accent.kuwaiti': 'كويتي',
    'accent.qatari': 'قطري',
    'accent.bahraini': 'بحريني',
    'accent.omani': 'عُماني',
    'accent.iraqi': 'عراقي',
    'accent.levantine': 'شامي',
    'accent.egyptian': 'مصري',
    'accent.libyan': 'ليبي',
    'accent.algerian': 'دارجة جزائرية',
    'accent.maghrebi': 'مغاربي (عام)',
    'accent.formalArabic': 'الفصحى',
    'accent.ethiopian': 'الأمهرية (إثيوبيا)',
    'accent.group.english': 'الإنجليزية',
    'accent.group.style': 'الأسلوب',
    'accent.group.arabicGulf': 'العربية — الخليج',
    'accent.group.arabicLevant': 'العربية — الشام والعراق',
    'accent.group.arabicNorthAfrica': 'العربية — شمال أفريقيا',
    'accent.group.other': 'أخرى',

    // ========== Lengths ==========
    'length.short': 'قصير — أقل من ١٠٠ حرف',
    'length.medium': 'متوسط — أقل من ٢٨٠ حرفاً',
    'length.long': 'طويل — حتى ٥٠٠ حرف',
    'length.shortShort': 'قصير — أقل من ١٠٠',
    'length.shortMedium': 'متوسط — أقل من ٢٨٠',
    'length.shortLong': 'طويل — حتى ٥٠٠',

    // ========== Providers ==========
    'providerName.kimi': 'Kimi (Moonshot)',
    'providerName.grok': 'Grok (xAI)',
    'providerName.openai': 'OpenAI',
    'providerName.deepseek': 'DeepSeek',
    'providerName.google': 'جوجل AI (Gemini)',
    'providerName.ollama': 'Ollama (محلي)',
    'providerName.custom': 'مخصص (متوافق مع OpenAI)',
    'provider.ollamaBaseHint': 'الافتراضي: <code>http://localhost:11434/v1</code>. ابدأ بـ <code>ollama serve</code> في الطرفية.',
    'provider.ollamaModelHint': 'شغّل <code>ollama pull llama3.1</code> لتحميل نموذج. جرّب <code>llama3.1</code>، <code>qwen2.5</code>، أو <code>mistral</code>.',
    'provider.ollamaNoKey': 'Ollama يعمل محلياً — لا حاجة لمفتاح API.',
    'contextMenu.factCheckPage': 'تحقق من هذه الصفحة',
    'contextMenu.factCheckSelection': 'تحقق من النص المحدد',
    'contextMenu.processing': 'جاري التحقق…',
    'contextMenu.noText': 'تعذّر استخراج نص من هذه الصفحة',
    'contextMenu.failed': 'فشل التحقق: {error}',

    // ========== Content-script overlays ==========
    'content.picker.title': 'اختر رداً',
    'content.toast.couldNotReadPost': 'تعذّر قراءة نص المنشور',
    'content.toast.replyFilled': 'تم تعبئة الرد — جاهز للنشر',
    'content.toast.couldNotFindReplyBox': 'تعذّر العثور على صندوق الرد',
    'content.toast.couldNotFillReplyBox': 'تعذّر تعبئة صندوق الرد',
    'content.toast.couldNotFindCommentBox': 'تعذّر العثور على صندوق التعليق',
    'content.toast.couldNotFillCommentBox': 'تعذّر تعبئة صندوق التعليق',
    'content.toast.failedToGenerate': 'فشل توليد الرد',
    'content.toast.aiGenerationFailed': 'فشل توليد الذكاء الاصطناعي',
    'content.toast.noPostFound': 'لا يوجد منشور مرئي',
    'content.toast.btnNotReady': 'زر AI لم يُربط بهذا المنشور بعد',

    // ========== Fact check ==========
    'factCheck.btnLabel': 'التحقق من صحة هذا المنشور',
    'factCheck.aiBtnLabel': 'توليد رد بالذكاء الاصطناعي',
    'factCheck.checking': 'جاري التحقق…',
    'factCheck.failed': 'فشل التحقق',
    'factCheck.parseFailed': 'تعذّر تحليل نتيجة التحقق',
    'factCheck.confidence': 'الثقة',
    'factCheck.confidenceLow': 'منخفضة',
    'factCheck.confidenceMedium': 'متوسطة',
    'factCheck.confidenceHigh': 'عالية',
    'factCheck.summary': 'الخلاصة',
    'factCheck.reasoning': 'التحليل',
    'factCheck.disclaimer': 'بناءً على بيانات تدريب الذكاء الاصطناعي. تحقق من المصادر الأولية للادعاءات المهمة.',
    'factCheck.close': 'إغلاق',
    'factCheck.verdict.true': 'صحيح على الأرجح',
    'factCheck.verdict.false': 'خاطئ على الأرجح',
    'factCheck.verdict.misleading': 'مضلل',
    'factCheck.verdict.unverifiable': 'غير قابل للتحقق',
    'factCheck.verdict.needsContext': 'يحتاج إلى سياق',
    'factCheck.sources': 'المصادر',
    'factCheck.searchUsed': 'بحث على الويب',
    'factCheck.disclaimerSearch': 'تم التحقق عبر نتائج البحث، لكن راجع المصادر الأولية دائماً للادعاءات المهمة.',

    // ========== OSINT toolbar ==========
    'osint.archive.label': 'أرشفة هذا المنشور (Wayback)',
    'osint.archive.starting': 'جاري الأرشفة…',
    'osint.archive.done': 'تمت الأرشفة. تم نسخ رابط Wayback.',
    'osint.archive.fallback': 'تم فتح archive.today في علامة تبويب جديدة',
    'osint.archive.failed': 'فشلت الأرشفة',
    'osint.reverseImage.label': 'البحث العكسي عن الصورة',
    'osint.reverseImage.menuTitle': 'ابحث عن الصورة على:',
    'osint.intel.label': 'فتح لوحة الاستخبارات',

    // ========== Intel panel ==========
    'intel.panel.title': 'تحليل',
    'intel.tab.claims': 'الادعاءات',
    'intel.tab.replies': 'الردود',
    'intel.tab.account': 'الحساب',
    'intel.tab.captures': 'المحفوظات',
    'intel.actions.capture': 'حفظ',
    'intel.actions.factCheck': 'تحقق',
    'intel.actions.refresh': 'تحديث',
    'intel.loading': 'جاري التحميل…',
    'intel.claims.empty': 'لم يتم استخراج أي ادعاءات.',
    'intel.claims.factCheck': 'تحقق',
    'intel.replies.noneFound': 'لا توجد ردود ظاهرة بعد — مرر لتحميلها ثم اضغط تحديث.',
    'intel.replies.noData': 'لا توجد بيانات للتحليل.',
    'intel.replies.noTopics': 'لم تظهر مواضيع.',
    'intel.replies.sampled': 'تم تحليل {n} عينة من الردود',
    'intel.replies.positive': 'إيجابي',
    'intel.replies.negative': 'سلبي',
    'intel.replies.neutral': 'محايد',
    'intel.replies.hostile': 'عدائي',
    'intel.replies.topics': 'أبرز المواضيع',
    'intel.account.disclaimer': 'إشارات استدلالية فقط. اعتبرها مؤشراً لا حكماً.',
    'intel.account.signalScore': 'مؤشر السلوك الآلي',
    'intel.account.noSignals': 'لا توجد إشارات لافتة من البيانات الظاهرة.',
    'intel.account.ageDays': 'عمر الحساب: {n} يوم',
    'intel.account.ratio': 'المتابعون / المتابَعون',
    'intel.account.verified': 'موثّق',
    'intel.captures.empty': 'لم تحفظ أي عناصر بعد. اضغط حفظ على أي منشور.',
    'intel.captures.saved': 'تم الحفظ.',
    'intel.captures.failed': 'فشل الحفظ',
    'intel.captures.open': 'فتح',
    'intel.captures.delete': 'حذف',

    // Search settings
    'search.cardTitle': 'البحث على الويب (للتحقق من الحقائق)',
    'search.cardDesc': 'اسمح لمدقق الحقائق بالبحث على الويب للتحقق من الادعاءات الحديثة. بدون ذلك، يعتمد التحقق على بيانات التدريب فقط.',
    'search.enable': 'تفعيل البحث على الويب للتحقق من الحقائق',
    'search.providerLabel': 'مزود البحث',
    'search.providerBrave': 'Brave Search',
    'search.providerTavily': 'Tavily',
    'search.apiKeyLabel': 'مفتاح API للبحث',
    'search.apiKeyPlaceholderBrave': 'X-Subscription-Token من Brave Search',
    'search.apiKeyPlaceholderTavily': 'مفتاح tvly-… من Tavily',
    'search.providerHintBrave': 'احصل على مفتاح مجاني من brave.com/search/api (2,000 استعلام/شهر مجاناً).',
    'search.providerHintTavily': 'احصل على مفتاح مجاني من tavily.com (1,000 رصيد/شهر مجاناً).',
  },
} as const;

export type MessageKey = keyof typeof dict.en;

export const locale = ref<Locale>('en');
export const isRTL = computed(() => locale.value === 'ar');

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const messages = dict[locale.value] as Record<string, string>;
  let s = messages[key] ?? (dict.en as Record<string, string>)[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(`{${k}}`, String(v));
    }
  }
  return s;
}

let listenerAttached = false;

export async function initLocale(): Promise<void> {
  try {
    const stored = await browser.storage.local.get(['locale']);
    if (stored.locale === 'ar' || stored.locale === 'en') {
      locale.value = stored.locale;
    }
    if (!listenerAttached && browser.storage?.onChanged) {
      listenerAttached = true;
      browser.storage.onChanged.addListener((changes) => {
        const v = changes.locale?.newValue;
        if (v === 'en' || v === 'ar') locale.value = v;
      });
    }
  } catch { /* ignore */ }
}

export async function setLocale(newLocale: Locale): Promise<void> {
  locale.value = newLocale;
  await browser.storage.local.set({ locale: newLocale });
}
