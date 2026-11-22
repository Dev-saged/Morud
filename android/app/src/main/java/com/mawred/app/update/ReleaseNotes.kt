package com.mawred.app.update

/** ملاحظات الإصدار (docs/releases/vX.md) مقسّمة لأقسام: الإضافات، المميزات، الإصلاحات… */
data class NotesSection(val title: String, val items: List<String>)
data class ReleaseNotes(val headline: String, val sections: List<NotesSection>) {
    companion object {
        private val MD = Regex("""\*\*(.+?)\*\*|`(.+?)`""")
        private fun clean(s: String) = MD.replace(s) { it.groupValues[1].ifEmpty { it.groupValues[2] } }.trim()

        fun parse(md: String): ReleaseNotes {
            var headline = ""
            val out = mutableListOf<NotesSection>()
            var title: String? = null
            val items = mutableListOf<String>()
            fun flush() { title?.let { if (items.isNotEmpty()) out += NotesSection(it, items.toList()) }; items.clear() }
            for (raw in md.lines()) {
                val l = raw.trim()
                when {
                    l.startsWith("# ") -> headline = clean(l.removePrefix("# ").substringAfter("—", l.removePrefix("# ")))
                    l.startsWith("## ") -> { flush(); title = clean(l.removePrefix("## ")) }
                    (l.startsWith("- ") || l.startsWith("* ")) && title != null -> items += clean(l.drop(2))
                    l.isNotEmpty() && title != null && !l.startsWith("#") -> items += clean(l)
                }
            }
            flush()
            return ReleaseNotes(headline, out)
        }
    }
}
