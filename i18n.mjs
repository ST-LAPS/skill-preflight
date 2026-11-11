export function validateLanguage(language) {
  if (!['en', 'ar'].includes(language)) throw new Error('Language must be en or ar.');
}

export function arabicFinding(finding) {
  const d = finding.details ?? {};
  switch (finding.rule) {
    case 'META_FRONTMATTER': return 'أضف بيانات YAML في بداية الملف تتضمن name وdescription.';
    case 'META_REQUIRED': return `يجب أن يحتوي الحقل ${d.key} على ${d.block ? 'نص متعدد الأسطر غير فارغ' : 'قيمة غير فارغة'}.`;
    case 'LINK_MISSING': return `الملف المشار إليه بالرابط المحلي غير موجود: ${d.link}`;
    case 'LINK_OUTSIDE_ROOT': return `الرابط المحلي ${d.resolved ? 'يُحل إلى مسار' : 'يشير إلى مسار'} خارج مجلد الفحص: ${d.link}`;
    case 'LINK_ENCODING': return 'يحتوي الرابط المحلي على ترميز مئوي غير صالح.';
    case 'RUNTIME_UNDECLARED': return `يستخدم الأمر ${d.runtime}؛ اذكره في قسم المتطلبات.`;
    case 'PORTABILITY_SHELL': return 'يفترض المثال بيئة أوامر POSIX؛ وضّح أنظمة التشغيل المدعومة أو وفّر بديلًا لنظام Windows.';
    case 'NO_SKILLS': return 'لم يُعثر على أي ملف SKILL.md داخل مجلد الفحص.';
    default: return finding.message;
  }
}

export function cliMessage(message, language) {
  if (language !== 'ar') return message;
  const messages = {
    'Input strict must be true or false.': 'يجب أن تكون قيمة strict إما true أو false.',
    'GITHUB_WORKSPACE is required.': 'متغير GITHUB_WORKSPACE مطلوب لتشغيل الإجراء.',
    'Scan path must stay inside GITHUB_WORKSPACE.': 'يجب أن يبقى مسار الفحص داخل مجلد GITHUB_WORKSPACE.',
    'Language must be en or ar.': 'يجب أن تكون اللغة en أو ar.',
    'Format must be text, json, or markdown.': 'يجب أن تكون صيغة التقرير text أو json أو markdown.',
    'Only one scan path is accepted.': 'يمكن تحديد مسار فحص واحد فقط.',
    'Scan root must not be a symbolic link.': 'يجب ألا يكون مسار الفحص رابطًا رمزيًا.',
    'Pass a directory or a SKILL.md file.': 'حدّد مجلدًا أو ملفًا باسم SKILL.md.',
  };
  if (messages[message]) return messages[message];
  if (message.startsWith('Unknown option: ')) return `خيار غير معروف: ${message.slice('Unknown option: '.length)}`;
  if (message.endsWith(' needs a value.')) return `يحتاج الخيار ${message.slice(0, -' needs a value.'.length)} إلى قيمة.`;
  return `تعذّر إتمام الفحص. التفاصيل التقنية: ${message}`;
}

export function help(language) {
  return language === 'ar'
    ? 'الاستخدام: node cli.mjs [directory|SKILL.md] [--lang ar|en] [--format text|json|markdown] [--output file] [--strict]\nرموز الخروج: 0 اجتاز الفحص، 1 توجد أخطاء (أو تحذيرات مع --strict)، 2 خطأ استخدام أو ملفات.\nفحص ثابت فقط؛ لا يشغّل ملفات المهارة ولا يتصل بالشبكة.'
    : 'Usage: node cli.mjs [directory|SKILL.md] [--lang en|ar] [--format text|json|markdown] [--output file] [--strict]\nExit: 0 passed, 1 findings (warnings fail only with --strict), 2 usage/I/O error.\nStatic inspection only. Never executes skill scripts or contacts a network.';
}
