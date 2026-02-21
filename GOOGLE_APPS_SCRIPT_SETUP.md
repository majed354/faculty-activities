# تعليمات إعداد Google Apps Script للقراءة المباشرة

## المشكلة الحالية
حالياً البيانات تُرسل إلى Google Sheets عبر Apps Script، لكنها لا تظهر في الموقع حتى يتم تصديرها يدوياً إلى CSV ورفعها على GitHub.

## الحل
إضافة دالة `doGet()` إلى Apps Script الموجود حتى يستطيع الموقع **قراءة** البيانات مباشرة من Google Sheets.

## خطوات الإعداد

### 1. افتح Google Apps Script
- اذهب إلى Google Sheet الخاص بك
- من القائمة: **Extensions > Apps Script**

### 2. أضف الكود التالي (لا تحذف الكود القديم)
أضف هذا الكود **أسفل** الكود الموجود حالياً (دالة `doPost`):

```javascript
// ========================================
// دالة القراءة - تسمح للموقع بقراءة البيانات مباشرة
// ========================================
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'read';

  if (action === 'read') {
    return readAllData();
  }

  return ContentService
    .createTextOutput(JSON.stringify({ error: 'Unknown action' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function readAllData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = {};

  // قراءة كل ورقة من الأوراق الموجودة
  var sheetNames = ['faculty', 'publications', 'theses', 'participations', 'students_count'];

  sheetNames.forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (sheet) {
      var data = sheet.getDataRange().getValues();
      if (data.length > 1) {
        var headers = data[0];
        var rows = [];
        for (var i = 1; i < data.length; i++) {
          var row = {};
          for (var j = 0; j < headers.length; j++) {
            var value = data[i][j];
            // تحويل التاريخ إذا كان كائن Date
            if (value instanceof Date) {
              value = Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
            }
            row[headers[j]] = value !== null && value !== undefined ? String(value) : '';
          }
          // تخطي الصفوف الفارغة
          var hasData = Object.values(row).some(function(v) { return v && v.trim() !== ''; });
          if (hasData) rows.push(row);
        }
        result[sheetName] = rows;
      } else {
        result[sheetName] = [];
      }
    }
  });

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### 3. تأكد من أسماء الأوراق
تأكد أن أسماء الأوراق (Sheets) في Google Sheets تتطابق مع:
- `faculty` - بيانات أعضاء هيئة التدريس
- `publications` - البحوث المنشورة
- `theses` - الرسائل العلمية
- `participations` - المشاركات والفعاليات
- `students_count` - أعداد الطلاب

### 4. تأكد من أن رؤوس الأعمدة (Headers) تتطابق مع ملفات CSV
مثلاً ورقة `faculty` يجب أن تحتوي على الأعمدة:
```
id | year | name | rank | email | active | department
```

ورقة `publications`:
```
id | year | title | authors_ids | journal | publish_date | citations_range | student_author
```

ورقة `theses`:
```
id | year | type | specialization | student_name | title | supervisor_id | co_supervisor_id | examiner1_id | examiner2_id | status | defense_date
```

ورقة `participations`:
```
id | year | category | title | participant_ids | date | location | participation_type | organized_by_department | student_details | notes | consulting_hours
```

### 5. انشر التحديث
- من القائمة: **Deploy > New deployment** (أو **Manage deployments**)
- اختر **Web app**
- Execute as: **Me**
- Who has access: **Anyone**
- اضغط **Deploy**

### 6. تحديث الرابط (إذا تغير)
إذا حصلت على رابط جديد بعد النشر، حدّث الرابط في ملف `data/config.json`:
```json
"google_sheets_api": "الرابط_الجديد"
```

## كيف يعمل النظام الآن

```
عضو يضيف نشاط → Google Sheets (فوري) → الموقع يقرأ من Sheets (فوري)
                                          ↕
                              ملفات CSV على GitHub (نسخة احتياطية)
```

1. عند فتح الموقع، يحمّل البيانات من CSV أولاً (السرعة)
2. ثم يحاول تحميل البيانات من Google Sheets
3. يدمج البيانات الجديدة من Sheets مع CSV
4. أي نشاط جديد يُضاف يظهر فوراً!

## ملاحظات مهمة
- ملفات CSV على GitHub تبقى كنسخة احتياطية ثابتة
- البيانات الجديدة من Google Sheets تُضاف تلقائياً فوق بيانات CSV
- لا حاجة لتصدير يدوي بعد الآن (إلا إذا أردت تحديث النسخة الاحتياطية)
