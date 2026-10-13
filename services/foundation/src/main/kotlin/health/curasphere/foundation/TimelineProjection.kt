package health.curasphere.foundation

import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlin.math.round

data class TimelineSource(
    val encounters: List<TimelineEncounter>,
    val conditions: List<TimelineCondition>,
    val allergies: List<TimelineAllergy>,
    val medications: List<TimelineMedication>,
    val observations: List<TimelineObservation>,
    val appointments: List<TimelineAppointment>,
)

data class TimelineEncounter(
    val id: String,
    val status: String,
    val reason: String,
    val startedAt: String,
    val endedAt: String?,
    val authorName: String,
)

data class TimelineCondition(val id: String, val display: String, val clinicalStatus: String, val recordedAt: String)

data class TimelineAllergy(val id: String, val display: String, val reaction: String, val recordedAt: String)

data class TimelineMedication(val id: String, val display: String, val dose: String, val status: String, val recordedAt: String)

data class TimelineObservation(
    val id: String,
    val display: String,
    val value: Double,
    val unit: String,
    val interpretation: String,
    val thresholdText: String,
    val effectiveAt: String,
    val authorName: String,
)

data class TimelineAppointment(val id: String, val reason: String, val startsAt: String, val status: String)

data class TimelineEventView(
    val id: String,
    val at: String,
    val kind: String,
    val title: String,
    val detail: String,
    val sourceId: String,
    val sourceTable: String,
    val abnormal: Boolean,
)

data class TimelineDayView(val day: String, val events: List<TimelineEventView>)

data class TimelineChangeView(
    val at: String,
    val text: String,
    val sourceId: String,
    val sourceTable: String,
    val abnormal: Boolean,
)

data class PatientTimelineView(
    val patientId: String,
    val group: String,
    val projectedAt: String,
    val since: String?,
    val events: List<TimelineEventView>,
    val days: List<TimelineDayView>,
    val changes: List<TimelineChangeView>,
)

private val GROUPS = mapOf(
    "results" to "observation",
    "encounters" to "encounter",
    "problems" to "condition",
    "allergies" to "allergy",
    "medications" to "medication",
    "visits" to "appointment",
)

fun timelineGroup(value: String): String? {
    if (value == "all") return "all"
    return if (GROUPS.containsKey(value)) value else null
}

fun projectPatientTimeline(patientId: String, group: String, source: TimelineSource, now: OffsetDateTime = OffsetDateTime.now(ZoneOffset.UTC)): PatientTimelineView {
    val events = buildList {
        for (item in source.encounters) {
            add(TimelineEventView("tl-${item.id}", item.startedAt, "encounter", "Encounter · ${item.reason}", "${item.status} · recorded by ${item.authorName}", item.id, "encounters", false))
        }
        for (item in source.conditions) {
            add(TimelineEventView("tl-${item.id}", item.recordedAt, "condition", "Condition · ${item.display}", item.clinicalStatus, item.id, "conditions", false))
        }
        for (item in source.allergies) {
            add(TimelineEventView("tl-${item.id}", item.recordedAt, "allergy", "Allergy recorded · ${item.display}", item.reaction, item.id, "allergies", false))
        }
        for (item in source.medications) {
            add(TimelineEventView("tl-${item.id}", item.recordedAt, "medication", "Medication · ${item.display}", "${item.dose} · ${item.status}", item.id, "medications", false))
        }
        for (item in source.observations) {
            add(
                TimelineEventView(
                    "tl-${item.id}",
                    item.effectiveAt,
                    "observation",
                    "${item.display} · ${formatQuantity(item.value)} ${item.unit}",
                    "Recorded by ${item.authorName}",
                    item.id,
                    "observations",
                    item.interpretation != "normal",
                ),
            )
        }
        for (item in source.appointments) {
            add(TimelineEventView("tl-${item.id}", item.startsAt, "appointment", "Appointment · ${item.reason}", item.status, item.id, "appointments", false))
        }
    }.sortedWith(compareByDescending<TimelineEventView> { it.at }.thenBy { it.id })
    val selected = if (group == "all") events else events.filter { it.kind == GROUPS.getValue(group) }
    val finished = source.encounters.mapNotNull { item -> if (item.status == "finished") item.endedAt else null }
    val since = finished.maxOrNull()
    val changes = ArrayList<TimelineChangeView>()
    for (item in source.encounters) {
        if (item.status == "in-progress") {
            changes.add(TimelineChangeView(item.startedAt, "Open encounter · ${item.reason}", item.id, "encounters", false))
        }
    }
    if (since != null) {
        for (item in source.observations) {
            if (item.effectiveAt <= since) continue
            val flag = if (item.interpretation == "normal") "" else " · ${item.thresholdText}"
            changes.add(TimelineChangeView(item.effectiveAt, "${item.display} · ${formatQuantity(item.value)} ${item.unit}$flag", item.id, "observations", item.interpretation != "normal"))
        }
        for (item in source.conditions) {
            if (item.recordedAt <= since) continue
            changes.add(TimelineChangeView(item.recordedAt, "Condition recorded · ${item.display} · ${item.clinicalStatus}", item.id, "conditions", false))
        }
        changes.sortWith(compareByDescending { it.at })
    }
    return PatientTimelineView(
        patientId = patientId,
        group = group,
        projectedAt = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC).format(now.toInstant()),
        since = since,
        events = selected,
        days = daysOf(selected),
        changes = changes,
    )
}

private fun daysOf(events: List<TimelineEventView>): List<TimelineDayView> {
    val days = ArrayList<TimelineDayView>()
    for (event in events) {
        val day = event.at.take(10)
        val current = days.lastOrNull()
        if (current == null || current.day != day) days.add(TimelineDayView(day, listOf(event)))
        else days[days.lastIndex] = current.copy(events = current.events + event)
    }
    return days
}

private fun formatQuantity(value: Double): String {
    if (value % 1.0 == 0.0) return value.toLong().toString()
    val rounded = round(value * 1000.0) / 1000.0
    return if (rounded % 1.0 == 0.0) rounded.toLong().toString() else rounded.toString()
}
