package com.mawred.app.schema

import com.mawred.app.core.Money

enum class FieldType { TEXT, PHONE, MONEY, QTY, NUMBER, BOOL, SELECT, DATE }

data class Field(
    val key: String,
    val label: String,
    val type: FieldType = FieldType.TEXT,
    val required: Boolean = false,
    val maxLength: Int = 200,
    val min: Long? = null,
    val max: Long? = null,
    val options: List<Pair<String, String>> = emptyList(),
    val permission: String? = null,
)

data class Column(val key: String, val label: String, val type: FieldType = FieldType.TEXT)
data class Filter(val key: String, val label: String, val value: Any?)
data class Kpi(val label: String, val type: FieldType = FieldType.NUMBER, val compute: (List<Map<String, Any?>>) -> Long)

/** وحدة كاملة كوصف صغير؛ المحرك العام يعرض النموذج والقائمة والمرشحات والمؤشرات. */
data class ModuleSchema(
    val id: String,
    val title: String,
    val permission: String,
    val fields: List<Field>,
    val columns: List<Column>,
    val filters: List<Filter> = emptyList(),
    val kpis: List<Kpi> = emptyList(),
    val searchKeys: List<String> = columns.map { it.key },
    val hooks: Map<String, String> = emptyMap(),
)

object SchemaEngine {
    /** تحقق القيم النصية القادمة من النموذج وتحويلها لأنواعها؛ يُرجع (القيم، الأخطاء). */
    fun validate(schema: ModuleSchema, input: Map<String, String>, can: (String) -> Boolean = { true }): Pair<Map<String, Any?>, Map<String, String>> {
        val out = mutableMapOf<String, Any?>()
        val errors = mutableMapOf<String, String>()
        for (f in schema.fields) {
            if (f.permission != null && !can(f.permission)) continue
            val raw = input[f.key]?.trim().orEmpty()
            if (raw.isEmpty()) {
                if (f.required && f.type != FieldType.BOOL) errors[f.key] = "${f.label} مطلوب"
                else out[f.key] = if (f.type == FieldType.BOOL) false else null
                continue
            }
            when (f.type) {
                FieldType.TEXT -> if (raw.length > f.maxLength) errors[f.key] = "${f.label}: الحد ${f.maxLength} حرفاً" else out[f.key] = raw
                FieldType.PHONE -> if (!Regex("""^\+?\d{7,15}$""").matches(raw.replace(" ", ""))) errors[f.key] = "رقم الهاتف غير صالح" else out[f.key] = raw.replace(" ", "")
                FieldType.MONEY -> Money.parse(raw)?.let { inRange(f, it, errors, out) } ?: run { errors[f.key] = "${f.label}: مبلغ غير صالح" }
                FieldType.QTY -> parseQty(raw)?.let { inRange(f, it, errors, out) } ?: run { errors[f.key] = "${f.label}: كمية غير صالحة" }
                FieldType.NUMBER -> raw.toLongOrNull()?.let { inRange(f, it, errors, out) } ?: run { errors[f.key] = "${f.label}: رقم غير صالح" }
                FieldType.BOOL -> out[f.key] = raw == "true"
                FieldType.SELECT -> if (f.options.none { it.first == raw }) errors[f.key] = "${f.label}: اختيار غير صالح" else out[f.key] = raw
                FieldType.DATE -> if (!Regex("""^\d{4}-\d{2}-\d{2}$""").matches(raw)) errors[f.key] = "${f.label}: التاريخ YYYY-MM-DD" else out[f.key] = raw
            }
        }
        return out to errors
    }

    private fun inRange(f: Field, v: Long, errors: MutableMap<String, String>, out: MutableMap<String, Any?>) {
        when {
            f.min != null && v < f.min -> errors[f.key] = "${f.label}: أقل من المسموح"
            f.max != null && v > f.max -> errors[f.key] = "${f.label}: أكبر من المسموح"
            else -> out[f.key] = v
        }
    }

    fun parseQty(s: String): Long? {
        val m = Regex("""^(\d{1,9})(?:[.,](\d{1,3}))?$""").matchEntire(s.trim()) ?: return null
        return m.groupValues[1].toLong() * 1000 + m.groupValues[2].padEnd(3, '0').toLong()
    }

    /** بحث نصي مطبّع عربياً + مرشحات مساواة. */
    fun filter(schema: ModuleSchema, rows: List<Map<String, Any?>>, query: String, active: Map<String, Any?>): List<Map<String, Any?>> {
        val q = normalize(query)
        return rows.filter { row ->
            active.all { (k, v) -> v == null || row[k] == v } &&
                (q.isEmpty() || schema.searchKeys.any { normalize(row[it]?.toString().orEmpty()).contains(q) })
        }
    }

    fun display(type: FieldType, v: Any?): String = when {
        v == null -> "—"
        type == FieldType.MONEY -> Money.format((v as Number).toLong())
        type == FieldType.QTY -> Money.formatQty((v as Number).toLong())
        type == FieldType.BOOL -> if (v == true) "نعم" else "لا"
        else -> v.toString()
    }

    /** تطبيع عربي للبحث: الهمزات، التاء المربوطة، الألف المقصورة، التشكيل. */
    fun normalize(s: String): String = s.lowercase()
        .replace(Regex("[ً-ْـ]"), "")
        .replace(Regex("[أإآ]"), "ا").replace('ة', 'ه').replace('ى', 'ي').replace('ؤ', 'و').replace('ئ', 'ي')
        .trim()
}
