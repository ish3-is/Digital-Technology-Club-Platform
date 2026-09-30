# عقود API

Better Auth /api/auth/*: sign-in/email، sign-out، request-password-reset، reset-password، list-sessions، revoke-session. sign-up محجوب HTTP؛ provisioning محلي فقط. أخطاء الواجهة عربية عامة. كل mutation يتحقق من Origin ويقبل JSON محدودًا. لا GET يغير بيانات.

| المسار | العقد | الحماية |
|---|---|---|
| GET /api/foundation | profile, committees, notifications, activities, permissions | جلسة نشطة + تهيئة |
| POST /api/profile | {name: string 2..80} | جلسة نشطة؛ تهيئة مسموحة |
| GET /api/committees/:id | {id,name,description} | committee.read داخل النطاق؛ 404 خلاف ذلك |
| PATCH /api/committees/:id | {description: string <= 2000} | committee.update داخل النطاق؛ معاملة وتدقيق |
| POST /api/notifications/:id | {} | مالك التنبيه فقط؛ 404 خلاف ذلك |
| GET /api/admin | users count, audit recent | organization.manage + audit.read لقراءة التدقيق |

401 غير مصادق، 403 صلاحية/أصل مرفوض، 404 مورد غير موجود أو غير مرئي، 422 مدخل غير صالح، 500 رسالة عامة. عدم تسريب stack أو محتوى السجل. خدمات القراءة هي حدود database access؛ لا endpoints عامة لكامل الجداول.

## واجهة العمل — المرحلة الثانية

كل المسارات أدناه تتطلب جلسة نشطة وحسابًا مهيأ. كل POST يتحقق من Origin. قراءة JSON محدودة أثناء البث إلى ٣٢ KiB. لا واجهة تعديل عشوائي للحالة. الأخطاء 401/403/404/409/413/422، ورسالة عامة لـ500.

| المسار | السلوك |
|---|---|
| GET /api/work?kind=task | قائمة العمل المصرح؛ kind اختياري |
| POST /api/work | إنشاء النوع المحدد؛ title, kind, termId وسياقه وتعييناته |
| GET /api/work/options | سياقات الإنشاء والأشخاص المتاحون وأسماء اللجان المستلمة |
| GET /api/work/inbox | إجراءات مشتقة مع bucket وreason؛ ليست notifications |
| GET /api/work/search?q= | بحث حرفي بالعناوين بعد ترشيح الوصول |
| GET /api/work/:id | تفاصيل وتعيينات واعتماديات وتعليقات ومرفقات وخط زمني وإجراءات مسموحة |
| POST /api/work/:id/transition | {to,version}؛ انتقال صريح |
| POST /api/work/:id/review | {decision,comment,version,overrideReason?} |
| POST /api/work/:id/assign | {userId,role} |
| POST /api/work/:id/dependencies | {blockerId,remove?} |
| POST /api/work/:id/comments | {body,mentions: userId[]} |
| POST /api/work/:mentionId/acknowledge | تأكيد اطلاع مالك الإشارة |
| POST /api/work/:id/respond | {response: accepted أو declined} |
| POST /api/work/:id/edit | {version,title?,description?,progress?,notes?} |
| POST /api/work/:id/attachments | multipart file، تحقق الأصل والحجم والنوع وإذن الأب |
| GET /api/work/files/:attachmentId | تنزيل خاص بعد إعادة فحص إذن الأب |

إنشاء مهمة من طلب أو قرار يستخدم sourceId ويستنتج اللجنة من المصدر؛ إنشاء قرار يستخدم meetingId. الفصل يجب أن يطابق المصدر. مثال مهمة: kind=task, title, committeeId, termId, responsibleId, reviewerId, participantIds?, dueAt?. مثال طلب: kind=request, requesting committeeId, receivingCommitteeId, reviewerId, termId. مثال اجتماع: kind=meeting, startAt, endAt, attendeeIds, location, agenda. كل التواريخ ISO مع offset؛ الواجهة تفسر حقولها بتوقيت الرياض.

صفحات المستخدم: /work، /work/tasks، /work/requests، /work/meetings، /work/decisions، /inbox، /notifications. المعامل item يفتح Drawer؛ create يفتح نموذجًا حسب الإذن؛ committee يحمل السياق.

## التخزين والتوسع
StorageProvider منفذ حاليًا عبر put(tx,key,bytes) وread(key) في PostgreSQL، مع تنزيل مصادق بدل روابط عامة. المخزن الخارجي وsigned URLs وفحص الفيروسات لاحقة. الأنواع المقبولة والحدود موثقة في WORK_ENGINE.md.
DomainEvent: id, actorId, action, entityType, entityId, correlationId, metadata, occurredAt. Workflow transition: expectedVersion, targetState, reason؛ locking/version checks تمنع اعتمادات متسابقة.

## واجهة الفعاليات — المرحلة الثالثة

كل مسار يتطلب جلسة نشطة ومهيأة. GET مقيد بالنطاق، وPOST يتحقق Origin. JSON محدود أثناء البث إلى ٢٥٦ ألف بايت، والملف إلى ٥ MiB مع هامش multipart. جميع الردود private,no-store.

| المسار | السلوك |
|---|---|
| GET /api/events?q= | قائمة وبحث بالعنوان ضمن النطاق |
| GET /api/events/options | سياقات الإنشاء والأعضاء المؤهلون والقوالب والأدوار |
| POST /api/events | إنشاء فعالية وقالب اختياري داخل معاملة |
| GET /api/events/:id | غرفة العمليات مع جاهزية وموانع وحقول حسب الصلاحيات |
| POST /api/events/:id/transition | to,version,reason?؛ انتقال صريح وتجاوز مدقق |
| POST /api/events/:id/review | decision,comment,version؛ اعتماد فعالية أو تقرير معلق |
| POST /api/events/:id/requirements | id?،title،category،required،ownerId،gate،dueAt?،evidence? |
| POST /api/events/:id/readiness | id,completed,evidence?؛ إكمال أو إعادة فتح متطلب |
| POST /api/events/:id/team | userId,roleId,committeeId?,startAt,endAt? |
| POST /api/events/:id/risks | id?,title,description?,probability,impact,ownerId,mitigation?,status? |
| POST /api/events/:id/resolve-risk | id,mitigation,status؛ معالجة خطر مسند |
| POST /api/events/:id/participants | participants[] أو csv؛ استيراد ذري مع منع التكرار |
| POST /api/events/:id/attendance | participantId,status؛ تحقق انتماء المشارك للفعالية |
| POST /api/events/:id/files | multipart: file,category,visibility |
| GET /api/events/files/:id | تنزيل مصادق وتصنيف محمي وnosniff/CSP |
| POST /api/events/:id/report | summary,objectives,execution,results,challenges,recommendations,evaluation,lessons |
| POST /api/events/:id/submit-report | تقديم التقرير للمعتمد المحدد |
| POST /api/events/:id/edit | version,title?,description?,plannedBudget?,approvedBudget?,actualSpend? |

إنشاء الفعالية: title,termId,committeeId,leadId,approverId,startAt,endAt,locationType,targetAudience؛ وdescription,eventType,locationText,meetingUrl,capacity,registrationUrl,plannedBudget,reportRequired,playbookId اختيارية/بافتراضاتها في events/model.ts. المبالغ في API هللات. work API يقبل eventId وtrack؛ لا ينشئ event عبر مساره العام. البحث ووارد العمل يشملان الفعاليات، ونتيجة kind=event تفتح /events/:id.

## الحوكمة والتقارير المؤسسية — المرحلة الرابعة

جلسة نشطة وحساب مهيأ؛ القراءات مقيدة بمنح اللجنة والفصل وتصنيف الدليل. كل POST يتحقق من `Origin` مقابل `BETTER_AUTH_URL`. الردود `private, no-store`، وحد JSON هو 64000 بايت، والملف 5 MiB مع هامش multipart. الإنشاء يعيد 201، وبقية الأوامر 200؛ الأخطاء 401/403/404/409/413/422 ورسالة عامة لـ500.

`kind` أحد: `goals`, `initiatives`, `kpis`, `evidence`, `reports`. الأوامر JSON ما لم يُذكر multipart؛ لا تعديل مباشر عشوائي للحالة.

| المسار | العقد |
|---|---|
| GET /api/governance (أو /lists) | قوائم الأهداف والمبادرات والمؤشرات والأدلة والتقارير المرئية |
| GET /api/governance/options | `contexts`, `people`, `reportTypes`؛ النوع المطلوب يجب أن يكون مهيأ مسبقًا، ولا توجد API لإنشاء أنواع التقارير |
| GET /api/governance/snapshot?term=&committee= | `pulse`, `kpis`, `health`, `alerts`, `weekly`, `actions` مع النطاق ووقت الحساب؛ النسب تتضمن البسط والمقام والصيغة والمصادر، والمقام الغائب ينتج null |
| GET /api/governance/search?q= | بحث حرفي بالعناوين/الأسماء ضمن النطاق؛ أقل من حرفين يعيد []؛ حتى 30 نتيجة `{id,title,kind,href}` |
| GET /api/governance/inbox | مراجعات مسندة، طلبات تعديل للمنشئ، واعتمادات جاهزة؛ `{id,title,action,reason,href,severity,type}` |
| GET /api/governance/:kind/:id | `{kind,row,permissions,timeline,measurements,linkedEvidence,reviewers,work,evidence}`؛ أقسام التقرير داخل `row.sections` |
| POST /api/governance/:kind | إنشاء وفق مخططات `src/app/api/governance/[[...path]]/route.ts` |
| POST /api/governance/:kind/:id/edit | الحقول المسموحة للنوع فقط؛ قيود الحالة والصلاحيات تُفحص في الخدمة |
| POST /api/governance/initiatives/:id/link | `{workId}` مع التحقق من المصدر والنطاق |
| POST /api/governance/kpis/:id/measure | `{value,measuredAt,note?}`؛ قيمة عدد صحيح ووقت ISO مع offset |
| POST /api/governance/evidence/:id/link | `{measurementId}`؛ يجب تطابق اللجنة والفصل |
| POST /api/governance/evidence/:id/verify | `{decision: reviewed أو rejected,comment?}`؛ سبب الرفض مطلوب، والتحقق مستقل عن رافع الدليل |
| GET /api/governance/evidence/:id/download | إعادة فحص إذن المصدر والتصنيف؛ Content-Disposition UTF-8 وnosniff وsandbox CSP |
| POST /api/governance/reports/:id/section | `{sectionId,content}`؛ القسم يجب أن ينتمي للتقرير |
| POST /api/governance/reports/:id/reviewers | `{userIds: string[]}`؛ 1–10 مراجعين مستقلين عن المنشئ ولديهم view وreview ضمن النطاق |
| POST /api/governance/reports/:id/submit | `{}`؛ يتطلب ملخصًا وكل الأقسام ومراجعًا؛ يعيد توصيات المراجعين إلى pending ويقفل التحرير |
| POST /api/governance/reports/:id/review | `{decision: approved أو changes_requested أو rejected,comment?}`؛ للمراجع المسند فقط، والسبب مطلوب لغير الموافقة |
| POST /api/governance/reports/:id/approve | `{}`؛ صلاحية مستقلة، والمنشئ ممنوع؛ يلزم under_review وجميع التوصيات approved، وإلا 409 |
| POST /api/governance/reports/:id/archive | `{}`؛ بعد الاعتماد فقط وبصلاحية report.update |

إنشاء التقرير: `title, summary?, academicTermId, committeeId?, typeId, periodStart, periodEnd, sectionKeys[]`. `summary` اختياري للمسودة لكنه مطلوب للتقديم. التواريخ ISO مع offset، وأقسام التقرير غير مكررة. إنشاء الهدف يتطلب `title, academicTermId` مع `committeeId?` وحقوله الاختيارية.

إنشاء الدليل: `title, description?, evidenceType, sourceEntityType, sourceEntityId, url?, date?, classification?`؛ النطاق مستنتج من المصدر، فلا تُرسل `academicTermId` أو `committeeId`. يلزم وصف أو رابط HTTPS أو ملف. رفع الملف يستخدم multipart بحقل `input` (JSON) و`file`؛ الأنواع PNG/JPEG/TXT. الأدلة المراجعة ثابتة، وأدلة التقرير مقفلة أثناء مراجعته وبعد اعتماده.

`evidence.view != evidence.verify` و`report.review != report.approve`: توصية approved تضع التقرير under_review ولا تعتمده؛ الاعتماد يحتاج إجراءً منفصلًا بعد اكتمال التوصيات. طلب التعديل يعيد الإجراء للمنشئ، وتظل القرارات موثقة في الخط الزمني.

صفحات المرحلة: `/governance`, `/governance/search?q=`, `/governance/inbox`, `/governance/executive` وموجز المشرف `/supervisor/brief`. لوحة Ctrl+K تفتح بحث الحوكمة بالنص المدخل. تقارير الفعاليات تبقى تحت `/api/events/:id/report`؛ لا يوجد `/api/governance/events/:id/report`.
