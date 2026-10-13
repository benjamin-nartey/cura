package health.curasphere.foundation

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.beans.factory.annotation.Value
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.security.MessageDigest
import java.sql.Timestamp
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.UUID

data class FoundationHealth(val ok: Boolean, val schemaVersion: Int, val store: String)

data class DirectoryPerson(
    val userId: String,
    val displayName: String,
    val role: String,
    val organizationId: String,
    val organizationName: String,
    val facilityId: String?,
    val facilityName: String?,
)

data class OpenedSession(val sessionId: String, val userId: String, val organizationId: String)

data class WorkforceSession(
    val sessionId: String,
    val userId: String,
    val displayName: String,
    val role: String,
    val purposeOfUse: String,
    val organizationId: String,
    val organizationName: String,
    val facilityId: String?,
    val facilityName: String?,
)

class DirectoryDisabledException : RuntimeException()

class UnknownDirectoryUserException : RuntimeException()

class InvalidDirectoryUserException : RuntimeException()

class ChartForbiddenException : RuntimeException()

class DuplicateSubmissionException : RuntimeException()

class ChartNotFoundException : RuntimeException()

class EncounterOpenException : RuntimeException()

class EncounterConflictException : RuntimeException()

class ObservationCodeException : RuntimeException()

class ObservationRangeException : RuntimeException()

data class OpenEncounterView(
    val id: String,
    val patientId: String,
    val patientName: String,
    val mrn: String,
    val reason: String,
    val startedAt: String,
    val version: Int,
)

data class OpenedEncounter(
    val id: String,
    val patientId: String,
    val reason: String,
    val startedAt: String,
    val version: Int,
)

data class FinishedEncounter(val id: String, val version: Int, val endedAt: String)

data class OpenEncounterBody(val patientId: String?, val reason: String?, val idempotencyKey: String?)

data class FinishEncounterBody(val expectedVersion: Int?, val idempotencyKey: String?)

data class ChartObservationView(
    val id: String,
    val code: String,
    val display: String,
    val value: Double,
    val unit: String,
    val codeSystemLabel: String,
    val codeSystemVersion: String,
    val unitSystemVersion: String,
    val bindingVersion: String,
    val interpretation: String,
    val thresholdText: String,
    val effectiveAt: String,
    val authorName: String,
    val encounterId: String?,
)

data class RecordedObservation(
    val id: String,
    val patientId: String,
    val encounterId: String?,
    val code: String,
    val display: String,
    val value: Double,
    val unit: String,
    val codeSystem: String,
    val codeSystemVersion: String,
    val unitSystemVersion: String,
    val bindingVersion: String,
    val interpretation: String,
    val thresholdText: String,
    val effectiveAt: String,
)

data class RecordObservationBody(
    val code: String?,
    val value: BigDecimal?,
    val idempotencyKey: String?,
    val effectiveAt: String? = null,
)

data class ChartConditionView(
    val id: String,
    val display: String,
    val code: String,
    val codeSystemLabel: String,
    val codeSystemVersion: String,
    val clinicalStatus: String,
    val recordedAt: String,
)

data class ChartAllergyView(
    val id: String,
    val display: String,
    val reaction: String,
    val criticality: String,
)

data class ChartMedicationView(
    val id: String,
    val display: String,
    val dose: String,
    val status: String,
)

data class ChartAppointmentView(
    val id: String,
    val reason: String,
    val startsAt: String,
    val status: String,
)

data class ChartCoreView(
    val conditions: List<ChartConditionView>,
    val allergies: List<ChartAllergyView>,
    val medications: List<ChartMedicationView>,
    val appointments: List<ChartAppointmentView>,
)

data class CatalogChoice(val code: String, val display: String, val unit: String, val min: Double, val max: Double)

data class BookAppointmentBody(
    val patientId: String? = null,
    val reason: String? = null,
    val startsAt: String? = null,
    val endsAt: String? = null,
    val idempotencyKey: String? = null,
)

data class BookedAppointment(
    val id: String,
    val patientId: String,
    val reason: String,
    val status: String,
    val startsAt: String,
    val endsAt: String,
)

data class ConditionChoice(
    val code: String,
    val display: String,
    val codeSystemLabel: String,
    val codeSystemVersion: String,
)

data class RecordConditionBody(
    val code: String? = null,
    val idempotencyKey: String? = null,
)

data class RecordLabOrderBody(
    val code: String? = null,
    val idempotencyKey: String? = null,
)

data class RecordedLabOrder(
    val id: String,
    val patientId: String,
    val code: String,
    val display: String,
    val codeSystem: String,
    val codeSystemVersion: String,
    val status: String,
    val createdAt: String,
)

data class CollectSpecimenBody(
    val idempotencyKey: String? = null,
)

data class RecordedSpecimen(
    val id: String,
    val orderId: String,
    val patientId: String,
    val collectedAt: String,
)

data class RecordLabResultBody(
    val value: BigDecimal? = null,
    val observationId: String? = null,
    val idempotencyKey: String? = null,
)

data class RecordedLabResult(
    val id: String,
    val orderId: String,
    val patientId: String,
    val observationId: String,
    val criticalFlag: String,
    val ruleVersion: String?,
    val alertId: String? = null,
)

data class AcknowledgeLabAlertBody(
    val idempotencyKey: String? = null,
)

data class RecordedLabAlertAcknowledgement(
    val id: String,
    val resultId: String,
    val orderId: String,
    val patientId: String,
    val criticalFlag: String,
    val status: String,
)

data class ProposePrescriptionBody(
    val formularyId: String? = null,
    val dose: String? = null,
    val idempotencyKey: String? = null,
)

data class RecordedPrescriptionWarning(
    val id: String,
    val kind: String,
    val severity: String,
    val ruleId: String,
)

data class RecordedPrescription(
    val id: String,
    val patientId: String,
    val formularyId: String,
    val display: String,
    val dose: String,
    val status: String,
    val warnings: List<RecordedPrescriptionWarning>,
)

data class RecordPrescriptionBody(
    val medicationId: String? = null,
    val idempotencyKey: String? = null,
)

data class RecordedActivePrescription(
    val id: String,
    val patientId: String,
    val medicationId: String,
    val status: String,
)

data class DispensePrescriptionBody(
    val quantity: Int? = null,
    val idempotencyKey: String? = null,
)

data class RecordedDispense(
    val id: String,
    val orderId: String,
    val patientId: String,
    val quantity: Int,
)

data class AdministerPrescriptionBody(
    val idempotencyKey: String? = null,
)

data class RecordedAdministration(
    val id: String,
    val orderId: String,
    val patientId: String,
)

data class AcknowledgeWarningBody(
    val idempotencyKey: String? = null,
)

data class RecordedWarningAcknowledgement(
    val id: String,
    val orderId: String,
    val patientId: String,
    val severity: String,
    val status: String,
)

data class RecordedCondition(
    val id: String,
    val patientId: String,
    val code: String,
    val display: String,
    val codeSystem: String,
    val codeSystemVersion: String,
    val clinicalStatus: String,
    val recordedAt: String,
)

data class RecordAllergyBody(
    val display: String? = null,
    val reaction: String? = null,
    val criticality: String? = null,
    val idempotencyKey: String? = null,
)

data class RecordedAllergy(
    val id: String,
    val patientId: String,
    val display: String,
    val reaction: String,
    val criticality: String,
    val recordedAt: String,
)

data class RecordMedicationBody(
    val display: String? = null,
    val dose: String? = null,
    val idempotencyKey: String? = null,
)

data class RecordedMedication(
    val id: String,
    val patientId: String,
    val display: String,
    val dose: String,
    val status: String,
    val recordedAt: String,
)

data class FacilityAppointmentView(
    val id: String,
    val patientId: String,
    val patientName: String,
    val mrn: String,
    val reason: String,
    val startsAt: String,
    val status: String,
)

data class PatientRecord(
    val id: String,
    val mrn: String,
    val givenName: String,
    val familyName: String,
    val birthDate: String,
    val sex: String,
    val ageYears: Int,
)

data class RegisterPatientBody(
    val givenName: String?,
    val familyName: String?,
    val birthDate: String?,
    val sex: String?,
    val idempotencyKey: String?,
)

@Service
class FoundationService(
    private val jdbc: JdbcTemplate,
    private val json: ObjectMapper,
    @Value("\${curasphere.env:development}") private val environment: String,
) {
    fun health(): FoundationHealth {
        val version = jdbc.queryForObject(
            "SELECT schema_version FROM foundation_meta WHERE id = 1",
            Int::class.java,
        ) ?: error("foundation schema is missing")
        return FoundationHealth(ok = true, schemaVersion = version, store = "postgresql")
    }

    fun directory(): List<DirectoryPerson> {
        assertDevelopmentDirectory()
        return jdbc.query(
            """
            SELECT u.id, u.display_name, u.role, u.organization_id, o.name AS organization_name,
                   u.facility_id, f.name AS facility_name
            FROM users u
            JOIN organizations o ON o.id = u.organization_id
            LEFT JOIN facilities f ON f.id = u.facility_id
            ORDER BY o.name, f.name NULLS FIRST, u.display_name
            """.trimIndent(),
        ) { rs, _ ->
            DirectoryPerson(
                userId = rs.getString("id"),
                displayName = rs.getString("display_name"),
                role = rs.getString("role"),
                organizationId = rs.getString("organization_id"),
                organizationName = rs.getString("organization_name"),
                facilityId = rs.getString("facility_id"),
                facilityName = rs.getString("facility_name"),
            )
        }
    }

    @Transactional
    fun openSession(userId: String): OpenedSession {
        assertDevelopmentDirectory()
        if (!USER_ID.matches(userId)) throw InvalidDirectoryUserException()
        val person = directoryRow(userId) ?: throw UnknownDirectoryUserException()
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val sessionId = "ses_${UUID.randomUUID()}"
        jdbc.update(
            "INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)",
            sessionId,
            person.userId,
            now,
        )
        jdbc.update(
            """
            INSERT INTO audit_events
              (id, organization_id, actor_id, action, resource_type, resource_id, outcome, created_at)
            VALUES (?, ?, ?, 'session.open', 'session', ?, 'success', ?)
            """.trimIndent(),
            "aud_${UUID.randomUUID()}",
            person.organizationId,
            person.userId,
            sessionId,
            now,
        )
        jdbc.update(
            """
            INSERT INTO outbox (id, organization_id, event_type, payload, created_at)
            VALUES (?, ?, 'session.opened', CAST(? AS jsonb), ?)
            """.trimIndent(),
            "out_${UUID.randomUUID()}",
            person.organizationId,
            json.writeValueAsString(mapOf("sessionId" to sessionId, "userId" to person.userId)),
            now,
        )
        return OpenedSession(sessionId, person.userId, person.organizationId)
    }

    fun readSession(sessionId: String): WorkforceSession? {
        if (!SESSION_ID.matches(sessionId)) throw InvalidDirectoryUserException()
        return jdbc.query(
            """
            SELECT u.id, u.display_name, u.role, u.organization_id, o.name AS organization_name,
                   u.facility_id, f.name AS facility_name
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            JOIN organizations o ON o.id = u.organization_id
            LEFT JOIN facilities f ON f.id = u.facility_id
            WHERE s.id = ?
              AND s.ended_at IS NULL
              AND s.created_at > now() - interval '12 hours'
            """.trimIndent(),
            { rs, _ ->
                val role = rs.getString("role")
                WorkforceSession(
                    sessionId = sessionId,
                    userId = rs.getString("id"),
                    displayName = rs.getString("display_name"),
                    role = role,
                    purposeOfUse = purposeFor(role),
                    organizationId = rs.getString("organization_id"),
                    organizationName = rs.getString("organization_name"),
                    facilityId = rs.getString("facility_id"),
                    facilityName = rs.getString("facility_name"),
                )
            },
            sessionId,
        ).firstOrNull()
    }

    @Transactional
    fun listPatients(sessionId: String, query: String): List<PatientRecord> {
        val session = readSession(sessionId) ?: throw UnknownDirectoryUserException()
        if (!canReadChart(session)) throw ChartForbiddenException()
        val facilityId = session.facilityId ?: throw ChartForbiddenException()
        val q = query.trim().lowercase().replace("%", "").replace("_", "").take(80)
        val like = "%$q%"
        val people = jdbc.query(
            """
            SELECT id, mrn, given_name, family_name, birth_date::text AS birth_date, sex
            FROM patients
            WHERE organization_id = ? AND facility_id = ?
              AND (? = '' OR lower(given_name) LIKE ? OR lower(family_name) LIKE ? OR lower(mrn) LIKE ?)
            ORDER BY family_name, given_name
            """.trimIndent(),
            { rs, _ -> toPatient(rs.getString("id"), rs.getString("mrn"), rs.getString("given_name"), rs.getString("family_name"), rs.getString("birth_date"), rs.getString("sex")) },
            session.organizationId,
            facilityId,
            q,
            like,
            like,
            like,
        )
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        jdbc.update(
            """
            INSERT INTO audit_events
              (id, organization_id, actor_id, action, resource_type, resource_id, outcome, created_at)
            VALUES (?, ?, ?, 'patient.list', 'patient', NULL, 'success', ?)
            """.trimIndent(),
            "aud_${UUID.randomUUID()}",
            session.organizationId,
            session.userId,
            now,
        )
        return people
    }

    @Transactional
    fun registerPatient(sessionId: String, body: RegisterPatientBody): PatientRecord {
        val session = readSession(sessionId) ?: throw UnknownDirectoryUserException()
        if (!canRegisterPatient(session)) throw ChartForbiddenException()
        val facilityId = session.facilityId ?: throw ChartForbiddenException()
        val givenName = cleanName(body.givenName)
        val familyName = cleanName(body.familyName)
        val birthDate = birthDate(body.birthDate)
        val sex = sex(body.sex)
        val key = body.idempotencyKey ?: ""
        if (!IDEMPOTENCY_KEY.matches(key)) throw InvalidDirectoryUserException()
        val hash = requestHash(
            listOf(
                "birthDate" to birthDate.toString(),
                "familyName" to familyName,
                "givenName" to givenName,
                "sex" to sex,
            ),
        )
        val existing = jdbc.query(
            """
            SELECT request_hash, response_json::text AS response_json
            FROM idempotency_keys
            WHERE organization_id = ? AND idempotency_key = ?
            """.trimIndent(),
            { rs, _ -> rs.getString("request_hash") to rs.getString("response_json") },
            session.organizationId,
            key,
        ).firstOrNull()
        if (existing != null) {
            if (existing.first != hash) throw DuplicateSubmissionException()
            return json.readValue(existing.second, PatientRecord::class.java)
        }
        val facilityName = session.facilityName ?: throw ChartForbiddenException()
        val prefix = facilityName.split(Regex("\\s+")).first().take(3).uppercase()
        val count = jdbc.queryForObject(
            "SELECT COUNT(*) FROM patients WHERE facility_id = ?",
            Int::class.java,
            facilityId,
        ) ?: 0
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val id = "pat_${UUID.randomUUID()}"
        val mrn = "$prefix-${1000 + count + 1}"
        jdbc.update(
            """
            INSERT INTO patients (
              id, organization_id, facility_id, mrn, given_name, family_name, birth_date, sex, author_id, recorded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            id,
            session.organizationId,
            facilityId,
            mrn,
            givenName,
            familyName,
            birthDate,
            sex,
            session.userId,
            now,
        )
        val created = toPatient(id, mrn, givenName, familyName, birthDate.toString(), sex)
        jdbc.update(
            """
            INSERT INTO audit_events
              (id, organization_id, actor_id, action, resource_type, resource_id, outcome, created_at)
            VALUES (?, ?, ?, 'patient.create', 'patient', ?, 'success', ?)
            """.trimIndent(),
            "aud_${UUID.randomUUID()}",
            session.organizationId,
            session.userId,
            id,
            now,
        )
        jdbc.update(
            """
            INSERT INTO outbox (id, organization_id, event_type, payload, created_at)
            VALUES (?, ?, 'patient.registered', CAST(? AS jsonb), ?)
            """.trimIndent(),
            "out_${UUID.randomUUID()}",
            session.organizationId,
            json.writeValueAsString(
                mapOf(
                    "organizationId" to session.organizationId,
                    "facilityId" to facilityId,
                    "patientId" to id,
                ),
            ),
            now,
        )
        jdbc.update(
            """
            INSERT INTO idempotency_keys (
              organization_id, idempotency_key, actor_id, request_hash, response_json, created_at
            ) VALUES (?, ?, ?, ?, CAST(? AS jsonb), ?)
            """.trimIndent(),
            session.organizationId,
            key,
            session.userId,
            hash,
            json.writeValueAsString(created),
            now,
        )
        return created
    }

    @Transactional
    fun listOpenEncounters(sessionId: String): List<OpenEncounterView> {
        val session = readableChart(sessionId)
        val rows = jdbc.query(
            """
            SELECT e.id, e.patient_id, p.given_name, p.family_name, p.mrn, e.reason, e.started_at, e.version
            FROM encounters e
            JOIN patients p ON p.id = e.patient_id
            WHERE e.organization_id = ? AND e.facility_id = ? AND e.status = 'in-progress'
            ORDER BY e.started_at
            """.trimIndent(),
            { rs, _ ->
                OpenEncounterView(
                    id = rs.getString("id"),
                    patientId = rs.getString("patient_id"),
                    patientName = "${rs.getString("given_name")} ${rs.getString("family_name")}",
                    mrn = rs.getString("mrn"),
                    reason = rs.getString("reason"),
                    startedAt = iso(rs.getTimestamp("started_at")),
                    version = rs.getInt("version"),
                )
            },
            session.organizationId,
            session.facilityId,
        )
        audit(session, "encounter.list", null)
        return rows
    }

    @Transactional
    fun openEncounter(sessionId: String, body: OpenEncounterBody): OpenedEncounter {
        val session = readableChart(sessionId)
        val patientId = body.patientId ?: ""
        if (!PATIENT_ID.matches(patientId)) throw InvalidDirectoryUserException()
        val reason = cleanReason(body.reason)
        val key = idempotencyKey(body.idempotencyKey)
        val hash = requestHash(listOf("patientId" to patientId, "reason" to reason))
        replay(session, key, hash, OpenedEncounter::class.java)?.let { return it }
        val visible = jdbc.queryForObject(
            """
            SELECT COUNT(*) FROM patients
            WHERE id = ? AND organization_id = ? AND facility_id = ?
            """.trimIndent(),
            Int::class.java,
            patientId,
            session.organizationId,
            session.facilityId,
        ) ?: 0
        if (visible != 1) throw ChartNotFoundException()
        val open = jdbc.queryForObject(
            """
            SELECT COUNT(*) FROM encounters
            WHERE patient_id = ? AND facility_id = ? AND status = 'in-progress'
            """.trimIndent(),
            Int::class.java,
            patientId,
            session.facilityId,
        ) ?: 0
        if (open > 0) throw EncounterOpenException()
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val id = "enc_${UUID.randomUUID()}"
        jdbc.update(
            """
            INSERT INTO encounters (
              id, organization_id, facility_id, patient_id, status, class, reason, started_at, author_id, version
            ) VALUES (?, ?, ?, ?, 'in-progress', 'ambulatory', ?, ?, ?, 1)
            """.trimIndent(),
            id,
            session.organizationId,
            session.facilityId,
            patientId,
            reason,
            Timestamp.from(now.toInstant()),
            session.userId,
        )
        val opened = OpenedEncounter(id, patientId, reason, iso(Timestamp.from(now.toInstant())), 1)
        audit(session, "encounter.create", id)
        outbox(session, "encounter.opened", mapOf("patientId" to patientId, "encounterId" to id))
        remember(session, key, hash, opened)
        return opened
    }

    @Transactional
    fun finishEncounter(sessionId: String, encounterId: String, body: FinishEncounterBody): FinishedEncounter {
        val session = readableChart(sessionId)
        if (!ENCOUNTER_ID.matches(encounterId)) throw InvalidDirectoryUserException()
        val expected = body.expectedVersion
        if (expected == null || expected < 1) throw InvalidDirectoryUserException()
        val key = idempotencyKey(body.idempotencyKey)
        val hash = requestHash(listOf("encounterId" to encounterId, "expectedVersion" to expected.toString()))
        replay(session, key, hash, FinishedEncounter::class.java)?.let { return it }
        val row = jdbc.query(
            """
            SELECT patient_id, status, version
            FROM encounters
            WHERE id = ? AND organization_id = ? AND facility_id = ?
            """.trimIndent(),
            { rs, _ -> Triple(rs.getString("patient_id"), rs.getString("status"), rs.getInt("version")) },
            encounterId,
            session.organizationId,
            session.facilityId,
        ).firstOrNull() ?: throw ChartNotFoundException()
        if (row.second != "in-progress" || row.third != expected) throw EncounterConflictException()
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val updated = jdbc.update(
            """
            UPDATE encounters
            SET status = 'finished', ended_at = ?, version = version + 1
            WHERE id = ? AND version = ? AND status = 'in-progress'
            """.trimIndent(),
            Timestamp.from(now.toInstant()),
            encounterId,
            expected,
        )
        if (updated != 1) throw EncounterConflictException()
        val finished = FinishedEncounter(encounterId, expected + 1, iso(Timestamp.from(now.toInstant())))
        audit(session, "encounter.complete", encounterId)
        outbox(session, "encounter.finished", mapOf("patientId" to row.first, "encounterId" to encounterId))
        remember(session, key, hash, finished)
        return finished
    }

    @Transactional
    fun listObservations(sessionId: String, patientId: String): List<ChartObservationView> {
        val session = readableChart(sessionId)
        if (!PATIENT_ID.matches(patientId)) throw InvalidDirectoryUserException()
        if (!patientOnFacility(session, patientId)) throw ChartNotFoundException()
        val rows = jdbc.query(
            """
            SELECT o.id, o.code, o.display, o.value, o.unit, o.code_system, o.code_system_version,
                   o.unit_system_version, o.binding_version, o.interpretation, o.threshold_text,
                   o.effective_at, o.encounter_id, u.display_name AS author_name
            FROM observations o
            JOIN users u ON u.id = o.author_id
            WHERE o.patient_id = ? AND o.organization_id = ? AND o.facility_id = ?
            ORDER BY o.effective_at DESC
            """.trimIndent(),
            { rs, _ ->
                ChartObservationView(
                    id = rs.getString("id"),
                    code = rs.getString("code"),
                    display = rs.getString("display"),
                    value = rs.getDouble("value"),
                    unit = rs.getString("unit"),
                    codeSystemLabel = codeSystemLabel(rs.getString("code_system")),
                    codeSystemVersion = rs.getString("code_system_version"),
                    unitSystemVersion = rs.getString("unit_system_version"),
                    bindingVersion = rs.getString("binding_version"),
                    interpretation = rs.getString("interpretation"),
                    thresholdText = rs.getString("threshold_text"),
                    effectiveAt = iso(rs.getTimestamp("effective_at")),
                    authorName = rs.getString("author_name"),
                    encounterId = rs.getString("encounter_id"),
                )
            },
            patientId,
            session.organizationId,
            session.facilityId,
        )
        audit(session, "observation.list", patientId, "Observation")
        return rows
    }

    @Transactional
    fun recordObservation(sessionId: String, patientId: String, body: RecordObservationBody): RecordedObservation {
        val session = readableChart(sessionId)
        if (!PATIENT_ID.matches(patientId)) throw InvalidDirectoryUserException()
        val code = body.code.orEmpty().trim()
        val value = body.value ?: throw InvalidDirectoryUserException()
        val key = idempotencyKey(body.idempotencyKey)
        val suppliedAt = body.effectiveAt?.trim().orEmpty()
        val effective = if (suppliedAt.isEmpty()) Timestamp.from(Instant.now()) else Timestamp.from(readingInstant(suppliedAt))
        val fields = mutableListOf("code" to code, "patientId" to patientId, "value" to value.stripTrailingZeros().toPlainString())
        if (suppliedAt.isNotEmpty()) fields.add("effectiveAt" to iso(effective))
        val hash = requestHash(fields)
        replay(session, key, hash, RecordedObservation::class.java)?.let { return it }
        if (!patientOnFacility(session, patientId)) throw ChartNotFoundException()
        val pin = observationPin(session.facilityId ?: throw ChartForbiddenException(), code) ?: throw ObservationCodeException()
        if (value < pin.min || value > pin.max) throw ObservationRangeException()
        val judged = interpretPin(pin, value)
        val id = "obs_${UUID.randomUUID()}"
        jdbc.update(
            """
            INSERT INTO observations (
              id, organization_id, facility_id, patient_id, encounter_id, code, code_system, code_system_version,
              display, value, unit, unit_system_version, binding_version, interpretation, threshold_text, effective_at, author_id
            ) VALUES (?, ?, ?, ?, NULL, ?, 'http://loinc.org', '2.78', ?, ?, ?, '2.2', 'facility-vitals-2026.10', ?, ?, ?, ?)
            """.trimIndent(),
            id,
            session.organizationId,
            session.facilityId,
            patientId,
            code,
            pin.display,
            value,
            pin.unit,
            judged.first,
            judged.second,
            effective,
            session.userId,
        )
        val recorded = RecordedObservation(
            id = id,
            patientId = patientId,
            encounterId = null,
            code = code,
            display = pin.display,
            value = value.toDouble(),
            unit = pin.unit,
            codeSystem = "http://loinc.org",
            codeSystemVersion = "2.78",
            unitSystemVersion = "2.2",
            bindingVersion = "facility-vitals-2026.10",
            interpretation = judged.first,
            thresholdText = judged.second,
            effectiveAt = iso(effective),
        )
        audit(session, "observation.record", id, "Observation")
        outbox(
            session,
            "observation.recorded",
            mapOf(
                "patientId" to patientId,
                "observationId" to id,
                "code" to code,
                "codeSystemVersion" to "2.78",
            ),
        )
        remember(session, key, hash, recorded)
        return recorded
    }

    @Transactional
    fun chartCore(sessionId: String, patientId: String): ChartCoreView {
        val session = readableChart(sessionId)
        if (!PATIENT_ID.matches(patientId)) throw InvalidDirectoryUserException()
        if (!patientOnFacility(session, patientId)) throw ChartNotFoundException()
        val conditions = jdbc.query(
            """
            SELECT id, display, code, code_system, code_system_version, clinical_status, recorded_at
            FROM conditions
            WHERE patient_id = ? AND organization_id = ? AND facility_id = ?
            ORDER BY recorded_at
            """.trimIndent(),
            { rs, _ ->
                ChartConditionView(
                    id = rs.getString("id"),
                    display = rs.getString("display"),
                    code = rs.getString("code"),
                    codeSystemLabel = codeSystemLabel(rs.getString("code_system")),
                    codeSystemVersion = rs.getString("code_system_version"),
                    clinicalStatus = rs.getString("clinical_status"),
                    recordedAt = iso(rs.getTimestamp("recorded_at")),
                )
            },
            patientId,
            session.organizationId,
            session.facilityId,
        )
        val allergies = jdbc.query(
            """
            SELECT id, display, reaction, criticality
            FROM allergies
            WHERE patient_id = ? AND organization_id = ? AND facility_id = ?
            ORDER BY recorded_at
            """.trimIndent(),
            { rs, _ ->
                ChartAllergyView(
                    id = rs.getString("id"),
                    display = rs.getString("display"),
                    reaction = rs.getString("reaction"),
                    criticality = rs.getString("criticality"),
                )
            },
            patientId,
            session.organizationId,
            session.facilityId,
        )
        val medications = jdbc.query(
            """
            SELECT id, display, dose, status
            FROM medications
            WHERE patient_id = ? AND organization_id = ? AND facility_id = ?
            ORDER BY recorded_at
            """.trimIndent(),
            { rs, _ ->
                ChartMedicationView(
                    id = rs.getString("id"),
                    display = rs.getString("display"),
                    dose = rs.getString("dose"),
                    status = rs.getString("status"),
                )
            },
            patientId,
            session.organizationId,
            session.facilityId,
        )
        val appointments = jdbc.query(
            """
            SELECT id, reason, starts_at, status
            FROM appointments
            WHERE patient_id = ? AND organization_id = ? AND facility_id = ?
            ORDER BY starts_at
            """.trimIndent(),
            { rs, _ ->
                ChartAppointmentView(
                    id = rs.getString("id"),
                    reason = rs.getString("reason"),
                    startsAt = iso(rs.getTimestamp("starts_at")),
                    status = rs.getString("status"),
                )
            },
            patientId,
            session.organizationId,
            session.facilityId,
        )
        audit(session, "chart.core", patientId, "Patient")
        return ChartCoreView(conditions, allergies, medications, appointments)
    }

    @Transactional
    fun patientTimeline(sessionId: String, patientId: String, groupText: String): PatientTimelineView {
        val session = readableChart(sessionId)
        val group = timelineGroup(groupText) ?: throw InvalidDirectoryUserException()
        if (!PATIENT_ID.matches(patientId)) throw InvalidDirectoryUserException()
        if (!patientOnFacility(session, patientId)) throw ChartNotFoundException()
        val scope = arrayOf(patientId, session.organizationId, session.facilityId)
        val encounters = jdbc.query(
            """
            SELECT e.id, e.status, e.reason, e.started_at, e.ended_at, u.display_name AS author_name
            FROM encounters e JOIN users u ON u.id = e.author_id
            WHERE e.patient_id = ? AND e.organization_id = ? AND e.facility_id = ?
            """.trimIndent(),
            { rs, _ ->
                TimelineEncounter(
                    id = rs.getString("id"),
                    status = rs.getString("status"),
                    reason = rs.getString("reason"),
                    startedAt = iso(rs.getTimestamp("started_at")),
                    endedAt = rs.getTimestamp("ended_at")?.let { iso(it) },
                    authorName = rs.getString("author_name"),
                )
            },
            *scope,
        )
        val conditions = jdbc.query(
            """
            SELECT id, display, clinical_status, recorded_at
            FROM conditions
            WHERE patient_id = ? AND organization_id = ? AND facility_id = ?
            """.trimIndent(),
            { rs, _ -> TimelineCondition(rs.getString("id"), rs.getString("display"), rs.getString("clinical_status"), iso(rs.getTimestamp("recorded_at"))) },
            *scope,
        )
        val allergies = jdbc.query(
            """
            SELECT id, display, reaction, recorded_at
            FROM allergies
            WHERE patient_id = ? AND organization_id = ? AND facility_id = ?
            """.trimIndent(),
            { rs, _ -> TimelineAllergy(rs.getString("id"), rs.getString("display"), rs.getString("reaction"), iso(rs.getTimestamp("recorded_at"))) },
            *scope,
        )
        val medications = jdbc.query(
            """
            SELECT id, display, dose, status, recorded_at
            FROM medications
            WHERE patient_id = ? AND organization_id = ? AND facility_id = ?
            """.trimIndent(),
            { rs, _ -> TimelineMedication(rs.getString("id"), rs.getString("display"), rs.getString("dose"), rs.getString("status"), iso(rs.getTimestamp("recorded_at"))) },
            *scope,
        )
        val observations = jdbc.query(
            """
            SELECT o.id, o.display, o.value, o.unit, o.interpretation, o.threshold_text, o.effective_at, u.display_name AS author_name
            FROM observations o JOIN users u ON u.id = o.author_id
            WHERE o.patient_id = ? AND o.organization_id = ? AND o.facility_id = ?
            """.trimIndent(),
            { rs, _ ->
                TimelineObservation(
                    id = rs.getString("id"),
                    display = rs.getString("display"),
                    value = rs.getDouble("value"),
                    unit = rs.getString("unit"),
                    interpretation = rs.getString("interpretation"),
                    thresholdText = rs.getString("threshold_text"),
                    effectiveAt = iso(rs.getTimestamp("effective_at")),
                    authorName = rs.getString("author_name"),
                )
            },
            *scope,
        )
        val appointments = jdbc.query(
            """
            SELECT id, reason, starts_at, status
            FROM appointments
            WHERE patient_id = ? AND organization_id = ? AND facility_id = ?
            """.trimIndent(),
            { rs, _ -> TimelineAppointment(rs.getString("id"), rs.getString("reason"), iso(rs.getTimestamp("starts_at")), rs.getString("status")) },
            *scope,
        )
        audit(session, "timeline.read", patientId, "Timeline")
        return projectPatientTimeline(patientId, group, TimelineSource(encounters, conditions, allergies, medications, observations, appointments))
    }

    @Transactional
    fun listCatalog(sessionId: String): List<CatalogChoice> {
        val session = readableChart(sessionId)
        val rows = jdbc.query(
            """
            SELECT p.code, p.display, p.unit, p.entry_min, p.entry_max
            FROM observation_pins p
            JOIN facility_observation_catalogs f ON f.catalog = p.catalog
            WHERE f.facility_id = ?
            ORDER BY p.display
            """.trimIndent(),
            { rs, _ ->
                CatalogChoice(
                    code = rs.getString("code"),
                    display = rs.getString("display"),
                    unit = rs.getString("unit"),
                    min = rs.getDouble("entry_min"),
                    max = rs.getDouble("entry_max"),
                )
            },
            session.facilityId,
        )
        audit(session, "catalog.list", session.facilityId, "Catalog")
        return rows
    }

    @Transactional
    fun listConditionCatalog(sessionId: String): List<ConditionChoice> {
        val session = readableChart(sessionId)
        audit(session, "condition.catalog", session.facilityId, "Catalog")
        return CONDITION_PINS.map { (code, display) ->
            ConditionChoice(code, display, "ICD-10-CM", ICD_VERSION)
        }
    }

    @Transactional
    fun recordCondition(sessionId: String, patientId: String, body: RecordConditionBody): RecordedCondition {
        val session = readableChart(sessionId)
        if (!PATIENT_ID.matches(patientId)) throw InvalidDirectoryUserException()
        val code = body.code.orEmpty().trim()
        val pin = CONDITION_PINS.firstOrNull { it.first == code } ?: throw ObservationCodeException()
        val key = idempotencyKey(body.idempotencyKey)
        val hash = requestHash(listOf("code" to code, "patientId" to patientId))
        replay(session, key, hash, RecordedCondition::class.java)?.let { return it }
        if (!patientOnFacility(session, patientId)) throw ChartNotFoundException()
        val id = "con_${UUID.randomUUID()}"
        val recordedAt = Timestamp.from(Instant.now())
        val saved = RecordedCondition(id, patientId, code, pin.second, ICD_SYSTEM, ICD_VERSION, "active", iso(recordedAt))
        jdbc.update(
            """
            INSERT INTO conditions (
              id, organization_id, facility_id, patient_id, code, code_system, code_system_version,
              display, clinical_status, recorded_at, author_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
            """.trimIndent(),
            id,
            session.organizationId,
            session.facilityId,
            patientId,
            code,
            ICD_SYSTEM,
            ICD_VERSION,
            pin.second,
            recordedAt,
            session.userId,
        )
        audit(session, "condition.record", id, "Condition")
        outbox(session, "condition.recorded", mapOf("patientId" to patientId, "conditionId" to id, "code" to code))
        remember(session, key, hash, saved)
        return saved
    }

    @Transactional
    fun recordLabOrder(sessionId: String, patientId: String, body: RecordLabOrderBody): RecordedLabOrder {
        val session = readSession(sessionId) ?: throw UnknownDirectoryUserException()
        if (!canRegisterPatient(session)) throw ChartForbiddenException()
        if (!PATIENT_ID.matches(patientId)) throw InvalidDirectoryUserException()
        val code = body.code.orEmpty().trim()
        val key = idempotencyKey(body.idempotencyKey)
        val hash = requestHash(listOf("code" to code, "patientId" to patientId))
        replay(session, key, hash, RecordedLabOrder::class.java)?.let { return it }
        if (!patientOnFacility(session, patientId)) throw ChartNotFoundException()
        val pin = observationPin(session.facilityId ?: throw ChartForbiddenException(), code) ?: throw ObservationCodeException()
        val id = "ord_${UUID.randomUUID()}"
        val createdAt = Timestamp.from(Instant.now())
        val saved = RecordedLabOrder(id, patientId, code, pin.display, "http://loinc.org", "2.78", "requested", iso(createdAt))
        jdbc.update(
            """
            INSERT INTO lab_orders (
              id, organization_id, facility_id, patient_id, code, code_system, code_system_version,
              display, status, created_at, author_id
            ) VALUES (?, ?, ?, ?, ?, 'http://loinc.org', '2.78', ?, 'requested', ?, ?)
            """.trimIndent(),
            id,
            session.organizationId,
            session.facilityId,
            patientId,
            code,
            pin.display,
            createdAt,
            session.userId,
        )
        audit(session, "lab.order", id, "LabOrder")
        outbox(session, "lab.ordered", mapOf("patientId" to patientId, "orderId" to id, "code" to code))
        remember(session, key, hash, saved)
        return saved
    }

    @Transactional
    fun collectSpecimen(sessionId: String, patientId: String, orderId: String, body: CollectSpecimenBody): RecordedSpecimen {
        val session = readableChart(sessionId)
        if (!PATIENT_ID.matches(patientId) || !ORDER_ID.matches(orderId)) throw InvalidDirectoryUserException()
        val key = idempotencyKey(body.idempotencyKey)
        val hash = requestHash(listOf("orderId" to orderId, "patientId" to patientId))
        replay(session, key, hash, RecordedSpecimen::class.java)?.let { return it }
        val status = jdbc.query(
            """
            SELECT status FROM lab_orders
            WHERE id = ? AND organization_id = ? AND facility_id = ? AND patient_id = ?
            """.trimIndent(),
            { rs, _ -> rs.getString("status") },
            orderId,
            session.organizationId,
            session.facilityId,
            patientId,
        ).firstOrNull() ?: throw ChartNotFoundException()
        if (status != "requested") throw EncounterConflictException()
        val id = "spc_${UUID.randomUUID()}"
        val collectedAt = Timestamp.from(Instant.now())
        val updated = jdbc.update(
            """
            UPDATE lab_orders SET status = 'collected'
            WHERE id = ? AND organization_id = ? AND facility_id = ? AND patient_id = ? AND status = 'requested'
            """.trimIndent(),
            orderId,
            session.organizationId,
            session.facilityId,
            patientId,
        )
        if (updated != 1) throw EncounterConflictException()
        jdbc.update(
            """
            INSERT INTO lab_specimens (id, order_id, organization_id, facility_id, collected_by, collected_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            id,
            orderId,
            session.organizationId,
            session.facilityId,
            session.userId,
            collectedAt,
        )
        val saved = RecordedSpecimen(id, orderId, patientId, iso(collectedAt))
        audit(session, "lab.specimen", id, "LabSpecimen")
        outbox(session, "lab.specimen.collected", mapOf("patientId" to patientId, "orderId" to orderId, "specimenId" to id))
        remember(session, key, hash, saved)
        return saved
    }

    @Transactional
    fun recordLabResult(sessionId: String, patientId: String, orderId: String, body: RecordLabResultBody): RecordedLabResult {
        val session = readableChart(sessionId)
        if (!PATIENT_ID.matches(patientId) || !ORDER_ID.matches(orderId)) throw InvalidDirectoryUserException()
        val value = body.value ?: throw InvalidDirectoryUserException()
        val observationId = body.observationId?.trim().orEmpty()
        if (!OBSERVATION_ID.matches(observationId)) throw InvalidDirectoryUserException()
        val key = idempotencyKey(body.idempotencyKey)
        val hash = requestHash(
            listOf(
                "observationId" to observationId,
                "orderId" to orderId,
                "patientId" to patientId,
                "value" to value.stripTrailingZeros().toPlainString(),
            ),
        )
        replay(session, key, hash, RecordedLabResult::class.java)?.let { return it }
        val order = jdbc.query(
            """
            SELECT code, status FROM lab_orders
            WHERE id = ? AND organization_id = ? AND facility_id = ? AND patient_id = ?
            """.trimIndent(),
            { rs, _ -> rs.getString("code") to rs.getString("status") },
            orderId,
            session.organizationId,
            session.facilityId,
            patientId,
        ).firstOrNull() ?: throw ChartNotFoundException()
        if (order.second != "collected") throw EncounterConflictException()
        val specimen = jdbc.queryForObject(
            "SELECT COUNT(*) FROM lab_specimens WHERE order_id = ? AND organization_id = ? AND facility_id = ?",
            Int::class.java,
            orderId,
            session.organizationId,
            session.facilityId,
        ) ?: 0
        if (specimen != 1) throw EncounterConflictException()
        val pin = observationPin(session.facilityId ?: throw ChartForbiddenException(), order.first) ?: throw ObservationCodeException()
        if (value < pin.min || value > pin.max) throw ObservationRangeException()
        val stored = jdbc.query(
            """
            SELECT code, value FROM observations
            WHERE id = ? AND organization_id = ? AND facility_id = ? AND patient_id = ?
            """.trimIndent(),
            { rs, _ -> rs.getString("code") to rs.getBigDecimal("value") },
            observationId,
            session.organizationId,
            session.facilityId,
            patientId,
        ).firstOrNull() ?: throw ChartNotFoundException()
        if (stored.first != order.first || stored.second.compareTo(value) != 0) throw InvalidDirectoryUserException()
        val rule = CRITICAL_PINS.firstOrNull { it.code == order.first }
        val flag = when {
            rule == null -> "none"
            value <= rule.low -> "critical-low"
            value >= rule.high -> "critical-high"
            else -> "none"
        }
        val ruleVersion = if (rule == null) null else LAB_RULE_VERSION
        val id = "lbr_${UUID.randomUUID()}"
        val recordedAt = Timestamp.from(Instant.now())
        val updated = jdbc.update(
            """
            UPDATE lab_orders SET status = 'resulted'
            WHERE id = ? AND organization_id = ? AND facility_id = ? AND patient_id = ? AND status = 'collected'
            """.trimIndent(),
            orderId,
            session.organizationId,
            session.facilityId,
            patientId,
        )
        if (updated != 1) throw EncounterConflictException()
        jdbc.update(
            """
            INSERT INTO lab_results (
              id, order_id, observation_id, organization_id, facility_id, patient_id, code, value, unit,
              unit_system_version, code_system_version, binding_version, reference_low, reference_high,
              critical_flag, rule_version, recorded_at, author_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '2.2', '2.78', 'facility-vitals-2026.10', ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            id,
            orderId,
            observationId,
            session.organizationId,
            session.facilityId,
            patientId,
            order.first,
            value,
            pin.unit,
            pin.low,
            pin.high,
            flag,
            ruleVersion,
            recordedAt,
            session.userId,
        )
        val alertId = if (flag == "none") null else "alt_${UUID.randomUUID()}"
        if (alertId != null) {
            jdbc.update(
                """
                INSERT INTO lab_alerts (
                  id, result_id, organization_id, facility_id, critical_flag, status
                ) VALUES (?, ?, ?, ?, ?, 'open')
                """.trimIndent(),
                alertId,
                id,
                session.organizationId,
                session.facilityId,
                flag,
            )
        }
        val saved = RecordedLabResult(id, orderId, patientId, observationId, flag, ruleVersion, alertId)
        audit(session, "lab.result", id, "LabResult")
        val payload = mutableMapOf(
            "patientId" to patientId,
            "orderId" to orderId,
            "observationId" to observationId,
            "resultId" to id,
            "criticalFlag" to flag,
        )
        if (ruleVersion != null) payload["ruleVersion"] = ruleVersion
        if (alertId != null) payload["alertId"] = alertId
        outbox(session, "lab.resulted", payload)
        remember(session, key, hash, saved)
        return saved
    }

    @Transactional
    fun acknowledgeLabAlert(sessionId: String, patientId: String, orderId: String, body: AcknowledgeLabAlertBody): RecordedLabAlertAcknowledgement {
        val session = readableChart(sessionId)
        if (!PATIENT_ID.matches(patientId) || !ORDER_ID.matches(orderId)) throw InvalidDirectoryUserException()
        val key = idempotencyKey(body.idempotencyKey)
        val hash = requestHash(listOf("orderId" to orderId, "patientId" to patientId))
        replay(session, key, hash, RecordedLabAlertAcknowledgement::class.java)?.let { return it }
        if (!patientOnFacility(session, patientId)) throw ChartNotFoundException()
        val alert = jdbc.query(
            """
            SELECT a.id, a.result_id, a.critical_flag, a.status, r.critical_flag AS result_flag
            FROM lab_results r
            JOIN lab_alerts a ON a.result_id = r.id
            WHERE r.order_id = ? AND r.patient_id = ?
              AND r.organization_id = ? AND r.facility_id = ?
              AND a.organization_id = ? AND a.facility_id = ?
            """.trimIndent(),
            { rs, _ -> listOf(rs.getString("id"), rs.getString("result_id"), rs.getString("critical_flag"), rs.getString("status"), rs.getString("result_flag")) },
            orderId,
            patientId,
            session.organizationId,
            session.facilityId,
            session.organizationId,
            session.facilityId,
        ).firstOrNull() ?: throw ChartNotFoundException()
        if (alert[3] != "open") throw EncounterConflictException()
        if (alert[2] == "none" || alert[2] != alert[4]) throw InvalidDirectoryUserException()
        val acknowledgedAt = Timestamp.from(Instant.now())
        val updated = jdbc.update(
            """
            UPDATE lab_alerts
            SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = ?
            WHERE id = ? AND status = 'open'
            """.trimIndent(),
            session.userId,
            acknowledgedAt,
            alert[0],
        )
        if (updated != 1) throw EncounterConflictException()
        val still = jdbc.queryForObject("SELECT critical_flag FROM lab_results WHERE id = ?", String::class.java, alert[1])
        if (still != alert[4]) throw InvalidDirectoryUserException()
        val saved = RecordedLabAlertAcknowledgement(alert[0], alert[1], orderId, patientId, alert[4], "acknowledged")
        audit(session, "lab.alert", alert[0], "LabAlert")
        outbox(
            session,
            "lab.alert",
            mapOf(
                "patientId" to patientId,
                "orderId" to orderId,
                "resultId" to alert[1],
                "alertId" to alert[0],
                "criticalFlag" to alert[4],
            ),
        )
        remember(session, key, hash, saved)
        return saved
    }

    @Transactional
    fun proposePrescription(sessionId: String, patientId: String, body: ProposePrescriptionBody): RecordedPrescription {
        val session = readSession(sessionId) ?: throw UnknownDirectoryUserException()
        if (!canRegisterPatient(session)) throw ChartForbiddenException()
        if (!PATIENT_ID.matches(patientId)) throw InvalidDirectoryUserException()
        val formularyId = body.formularyId.orEmpty().trim()
        val drug = RX_FORMULARY.firstOrNull { it.id == formularyId } ?: throw ObservationCodeException()
        val dose = prescriptionDose(body.dose)
        val key = idempotencyKey(body.idempotencyKey)
        val hash = requestHash(listOf("dose" to dose, "formularyId" to drug.id, "patientId" to patientId))
        replay(session, key, hash, RecordedPrescription::class.java)?.let { return it }
        if (!patientOnFacility(session, patientId)) throw ChartNotFoundException()
        val drafts = prescriptionWarnings(session, patientId, drug)
        val id = "rxo_${UUID.randomUUID()}"
        val createdAt = Timestamp.from(Instant.now())
        jdbc.update(
            """
            INSERT INTO rx_orders (
              id, organization_id, facility_id, patient_id, formulary_id, display, therapy_class, dose, status, created_at, author_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?)
            """.trimIndent(),
            id,
            session.organizationId,
            session.facilityId,
            patientId,
            drug.id,
            drug.display,
            drug.therapyClass,
            dose,
            createdAt,
            session.userId,
        )
        val warnings = drafts.map { draft ->
            val warningId = "rxw_${UUID.randomUUID()}"
            jdbc.update(
                """
                INSERT INTO rx_warnings (
                  id, order_id, organization_id, facility_id, kind, severity, rule_id, rule_version, source, summary, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local-pin', ?, 'open', ?)
                """.trimIndent(),
                warningId,
                id,
                session.organizationId,
                session.facilityId,
                draft.kind,
                draft.severity,
                draft.ruleId,
                MED_SAFETY_VERSION,
                draft.summary,
                createdAt,
            )
            RecordedPrescriptionWarning(warningId, draft.kind, draft.severity, draft.ruleId)
        }
        val saved = RecordedPrescription(id, patientId, drug.id, drug.display, dose, "proposed", warnings)
        audit(session, "rx.prescribe", id, "RxOrder")
        outbox(
            session,
            "rx.prescribe",
            mapOf(
                "patientId" to patientId,
                "orderId" to id,
                "formularyId" to drug.id,
                "warningCount" to warnings.size.toString(),
            ),
        )
        remember(session, key, hash, saved)
        return saved
    }

    @Transactional
    fun recordPrescription(sessionId: String, patientId: String, orderId: String, body: RecordPrescriptionBody): RecordedActivePrescription {
        val session = readSession(sessionId) ?: throw UnknownDirectoryUserException()
        if (!canRegisterPatient(session)) throw ChartForbiddenException()
        if (!PATIENT_ID.matches(patientId) || !RX_ORDER_ID.matches(orderId)) throw InvalidDirectoryUserException()
        val medicationId = body.medicationId.orEmpty().trim()
        if (!MEDICATION_ID.matches(medicationId)) throw InvalidDirectoryUserException()
        val key = idempotencyKey(body.idempotencyKey)
        val hash = requestHash(listOf("medicationId" to medicationId, "orderId" to orderId, "patientId" to patientId))
        replay(session, key, hash, RecordedActivePrescription::class.java)?.let { return it }
        if (!patientOnFacility(session, patientId)) throw ChartNotFoundException()
        val order = jdbc.query(
            """
            SELECT formulary_id, display, dose, status FROM rx_orders
            WHERE id = ? AND organization_id = ? AND facility_id = ? AND patient_id = ?
            """.trimIndent(),
            { rs, _ -> listOf(rs.getString("formulary_id"), rs.getString("display"), rs.getString("dose"), rs.getString("status")) },
            orderId,
            session.organizationId,
            session.facilityId,
            patientId,
        ).firstOrNull() ?: throw ChartNotFoundException()
        if (order[3] != "proposed") throw EncounterConflictException()
        val medication = jdbc.query(
            """
            SELECT display, dose, status FROM medications
            WHERE id = ? AND organization_id = ? AND facility_id = ? AND patient_id = ?
            """.trimIndent(),
            { rs, _ -> listOf(rs.getString("display"), rs.getString("dose"), rs.getString("status")) },
            medicationId,
            session.organizationId,
            session.facilityId,
            patientId,
        ).firstOrNull() ?: throw ChartNotFoundException()
        if (medication[2] != "active" || medication[0] != order[1] || medication[1] != order[2]) throw EncounterConflictException()
        val updated = jdbc.update(
            "UPDATE rx_orders SET status = 'active', medication_id = ? WHERE id = ? AND status = 'proposed'",
            medicationId,
            orderId,
        )
        if (updated != 1) throw EncounterConflictException()
        val saved = RecordedActivePrescription(orderId, patientId, medicationId, "active")
        audit(session, "rx.activate", orderId, "RxOrder")
        outbox(
            session,
            "rx.activate",
            mapOf(
                "patientId" to patientId,
                "orderId" to orderId,
                "medicationId" to medicationId,
                "formularyId" to order[0],
            ),
        )
        remember(session, key, hash, saved)
        return saved
    }

    @Transactional
    fun dispensePrescription(sessionId: String, patientId: String, orderId: String, body: DispensePrescriptionBody): RecordedDispense {
        val session = readableChart(sessionId)
        if (!PATIENT_ID.matches(patientId) || !RX_ORDER_ID.matches(orderId)) throw InvalidDirectoryUserException()
        val quantity = body.quantity ?: throw InvalidDirectoryUserException()
        if (quantity !in 1..90) throw ObservationRangeException()
        val key = idempotencyKey(body.idempotencyKey)
        val hash = requestHash(listOf("orderId" to orderId, "patientId" to patientId, "quantity" to quantity.toString()))
        replay(session, key, hash, RecordedDispense::class.java)?.let { return it }
        if (!patientOnFacility(session, patientId)) throw ChartNotFoundException()
        val status = jdbc.query(
            """
            SELECT status FROM rx_orders
            WHERE id = ? AND organization_id = ? AND facility_id = ? AND patient_id = ?
            """.trimIndent(),
            { rs, _ -> rs.getString("status") },
            orderId,
            session.organizationId,
            session.facilityId,
            patientId,
        ).firstOrNull() ?: throw ChartNotFoundException()
        if (status != "active" && status != "dispensed") throw EncounterConflictException()
        val id = "rxd_${UUID.randomUUID()}"
        val dispensedAt = Timestamp.from(Instant.now())
        jdbc.update(
            """
            INSERT INTO rx_dispenses (
              id, order_id, organization_id, facility_id, quantity, dispensed_by, dispensed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            id,
            orderId,
            session.organizationId,
            session.facilityId,
            quantity,
            session.userId,
            dispensedAt,
        )
        jdbc.update("UPDATE rx_orders SET status = 'dispensed' WHERE id = ?", orderId)
        val saved = RecordedDispense(id, orderId, patientId, quantity)
        audit(session, "rx.dispense", id, "RxDispense")
        outbox(
            session,
            "rx.dispense",
            mapOf("patientId" to patientId, "orderId" to orderId, "dispenseId" to id),
        )
        remember(session, key, hash, saved)
        return saved
    }

    @Transactional
    fun administerPrescription(sessionId: String, patientId: String, orderId: String, body: AdministerPrescriptionBody): RecordedAdministration {
        val session = readableChart(sessionId)
        if (!PATIENT_ID.matches(patientId) || !RX_ORDER_ID.matches(orderId)) throw InvalidDirectoryUserException()
        val key = idempotencyKey(body.idempotencyKey)
        val hash = requestHash(listOf("action" to "administer", "orderId" to orderId, "patientId" to patientId))
        replay(session, key, hash, RecordedAdministration::class.java)?.let { return it }
        if (!patientOnFacility(session, patientId)) throw ChartNotFoundException()
        val status = jdbc.query(
            """
            SELECT status FROM rx_orders
            WHERE id = ? AND organization_id = ? AND facility_id = ? AND patient_id = ?
            """.trimIndent(),
            { rs, _ -> rs.getString("status") },
            orderId,
            session.organizationId,
            session.facilityId,
            patientId,
        ).firstOrNull() ?: throw ChartNotFoundException()
        if (status != "active" && status != "dispensed") throw EncounterConflictException()
        val id = "rxa_${UUID.randomUUID()}"
        val administeredAt = Timestamp.from(Instant.now())
        jdbc.update(
            """
            INSERT INTO rx_administrations (
              id, order_id, organization_id, facility_id, administered_by, administered_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            id,
            orderId,
            session.organizationId,
            session.facilityId,
            session.userId,
            administeredAt,
        )
        val saved = RecordedAdministration(id, orderId, patientId)
        audit(session, "rx.administer", id, "RxAdministration")
        outbox(
            session,
            "rx.administer",
            mapOf("patientId" to patientId, "orderId" to orderId, "administrationId" to id),
        )
        remember(session, key, hash, saved)
        return saved
    }

    @Transactional
    fun acknowledgeWarning(sessionId: String, patientId: String, orderId: String, warningId: String, body: AcknowledgeWarningBody): RecordedWarningAcknowledgement {
        val session = readableChart(sessionId)
        if (!PATIENT_ID.matches(patientId) || !RX_ORDER_ID.matches(orderId) || !WARNING_ID.matches(warningId)) throw InvalidDirectoryUserException()
        val key = idempotencyKey(body.idempotencyKey)
        val hash = requestHash(listOf("orderId" to orderId, "patientId" to patientId, "warningId" to warningId))
        replay(session, key, hash, RecordedWarningAcknowledgement::class.java)?.let { return it }
        if (!patientOnFacility(session, patientId)) throw ChartNotFoundException()
        val warning = jdbc.query(
            """
            SELECT w.severity, w.status
            FROM rx_warnings w
            JOIN rx_orders o ON o.id = w.order_id
            WHERE w.id = ? AND w.order_id = ? AND o.patient_id = ?
              AND w.organization_id = ? AND w.facility_id = ?
              AND o.organization_id = ? AND o.facility_id = ?
            """.trimIndent(),
            { rs, _ -> rs.getString("severity") to rs.getString("status") },
            warningId,
            orderId,
            patientId,
            session.organizationId,
            session.facilityId,
            session.organizationId,
            session.facilityId,
        ).firstOrNull() ?: throw ChartNotFoundException()
        if (warning.second != "open") throw EncounterConflictException()
        val acknowledgedAt = Timestamp.from(Instant.now())
        val updated = jdbc.update(
            """
            UPDATE rx_warnings
            SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = ?
            WHERE id = ? AND status = 'open'
            """.trimIndent(),
            session.userId,
            acknowledgedAt,
            warningId,
        )
        if (updated != 1) throw EncounterConflictException()
        val severity = jdbc.queryForObject("SELECT severity FROM rx_warnings WHERE id = ?", String::class.java, warningId)
        if (severity != warning.first) throw InvalidDirectoryUserException()
        val saved = RecordedWarningAcknowledgement(warningId, orderId, patientId, warning.first, "acknowledged")
        audit(session, "rx.warning", warningId, "RxWarning")
        outbox(
            session,
            "rx.warning",
            mapOf(
                "patientId" to patientId,
                "orderId" to orderId,
                "warningId" to warningId,
                "severity" to warning.first,
            ),
        )
        remember(session, key, hash, saved)
        return saved
    }

    @Transactional
    fun recordAllergy(sessionId: String, patientId: String, body: RecordAllergyBody): RecordedAllergy {
        val session = readableChart(sessionId)
        if (!PATIENT_ID.matches(patientId)) throw InvalidDirectoryUserException()
        val display = cleanChartText(body.display, 1, 80)
        val reaction = cleanChartText(body.reaction, 1, 80)
        val criticality = when (body.criticality) {
            "low", "high" -> body.criticality
            else -> throw InvalidDirectoryUserException()
        }
        val key = idempotencyKey(body.idempotencyKey)
        val hash = requestHash(listOf("criticality" to criticality, "display" to display, "patientId" to patientId, "reaction" to reaction))
        replay(session, key, hash, RecordedAllergy::class.java)?.let { return it }
        if (!patientOnFacility(session, patientId)) throw ChartNotFoundException()
        val id = "all_${UUID.randomUUID()}"
        val recordedAt = Timestamp.from(Instant.now())
        val saved = RecordedAllergy(id, patientId, display, reaction, criticality, iso(recordedAt))
        jdbc.update(
            """
            INSERT INTO allergies (
              id, organization_id, facility_id, patient_id, display, reaction, criticality, recorded_at, author_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            id,
            session.organizationId,
            session.facilityId,
            patientId,
            display,
            reaction,
            criticality,
            recordedAt,
            session.userId,
        )
        audit(session, "allergy.record", id, "Allergy")
        outbox(session, "allergy.recorded", mapOf("patientId" to patientId, "allergyId" to id))
        remember(session, key, hash, saved)
        return saved
    }

    @Transactional
    fun recordMedication(sessionId: String, patientId: String, body: RecordMedicationBody): RecordedMedication {
        val session = readSession(sessionId) ?: throw UnknownDirectoryUserException()
        if (!canRegisterPatient(session)) throw ChartForbiddenException()
        if (!PATIENT_ID.matches(patientId)) throw InvalidDirectoryUserException()
        val display = cleanChartText(body.display, 1, 80)
        val dose = cleanChartText(body.dose, 1, 80)
        val key = idempotencyKey(body.idempotencyKey)
        val hash = requestHash(listOf("display" to display, "dose" to dose, "patientId" to patientId))
        replay(session, key, hash, RecordedMedication::class.java)?.let { return it }
        if (!patientOnFacility(session, patientId)) throw ChartNotFoundException()
        val id = "med_${UUID.randomUUID()}"
        val recordedAt = Timestamp.from(Instant.now())
        val saved = RecordedMedication(id, patientId, display, dose, "active", iso(recordedAt))
        jdbc.update(
            """
            INSERT INTO medications (
              id, organization_id, facility_id, patient_id, display, dose, status, recorded_at, author_id
            ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
            """.trimIndent(),
            id,
            session.organizationId,
            session.facilityId,
            patientId,
            display,
            dose,
            recordedAt,
            session.userId,
        )
        audit(session, "medication.record", id, "Medication")
        outbox(session, "medication.recorded", mapOf("patientId" to patientId, "medicationId" to id))
        remember(session, key, hash, saved)
        return saved
    }

    @Transactional
    fun bookAppointment(sessionId: String, body: BookAppointmentBody): BookedAppointment {
        val session = readSession(sessionId) ?: throw UnknownDirectoryUserException()
        if (!canRegisterPatient(session)) throw ChartForbiddenException()
        val patientId = body.patientId?.trim().orEmpty()
        val reason = cleanReason(body.reason)
        val starts = visitInstant(body.startsAt)
        val ends = visitInstant(body.endsAt)
        if (!ends.isAfter(starts)) throw InvalidDirectoryUserException()
        val key = idempotencyKey(body.idempotencyKey)
        if (!PATIENT_ID.matches(patientId)) throw InvalidDirectoryUserException()
        val startsAt = Timestamp.from(starts)
        val endsAt = Timestamp.from(ends)
        val hash = requestHash(
            listOf(
                "endsAt" to iso(endsAt),
                "patientId" to patientId,
                "reason" to reason,
                "startsAt" to iso(startsAt),
            ),
        )
        replay(session, key, hash, BookedAppointment::class.java)?.let { return it }
        if (!patientOnFacility(session, patientId)) throw ChartNotFoundException()
        val id = "apt_${UUID.randomUUID()}"
        val saved = BookedAppointment(id, patientId, reason, "booked", iso(startsAt), iso(endsAt))
        jdbc.update(
            """
            INSERT INTO appointments
              (id, organization_id, facility_id, patient_id, status, reason, starts_at, ends_at)
            VALUES (?, ?, ?, ?, 'booked', ?, ?, ?)
            """.trimIndent(),
            id,
            session.organizationId,
            session.facilityId,
            patientId,
            reason,
            startsAt,
            endsAt,
        )
        audit(session, "appointment.book", id, "Appointment")
        outbox(session, "appointment.booked", mapOf("patientId" to patientId, "appointmentId" to id))
        remember(session, key, hash, saved)
        return saved
    }

    @Transactional
    fun listAppointments(sessionId: String, dayText: String = ""): List<FacilityAppointmentView> {
        val session = readableChart(sessionId)
        val day = if (dayText.isBlank()) {
            LocalDate.now(ZoneOffset.UTC)
        } else {
            if (!Regex("""\d{4}-\d{2}-\d{2}""").matches(dayText)) throw InvalidDirectoryUserException()
            try {
                LocalDate.parse(dayText)
            } catch (_: java.time.format.DateTimeParseException) {
                throw InvalidDirectoryUserException()
            }
        }
        val rows = jdbc.query(
            """
            SELECT a.id, a.patient_id, p.given_name, p.family_name, p.mrn, a.reason, a.starts_at, a.status
            FROM appointments a
            JOIN patients p ON p.id = a.patient_id
            WHERE a.organization_id = ? AND a.facility_id = ?
              AND a.starts_at >= ? AND a.starts_at < ?
            ORDER BY a.starts_at
            """.trimIndent(),
            { rs, _ ->
                FacilityAppointmentView(
                    id = rs.getString("id"),
                    patientId = rs.getString("patient_id"),
                    patientName = "${rs.getString("given_name")} ${rs.getString("family_name")}",
                    mrn = rs.getString("mrn"),
                    reason = rs.getString("reason"),
                    startsAt = iso(rs.getTimestamp("starts_at")),
                    status = rs.getString("status"),
                )
            },
            session.organizationId,
            session.facilityId,
            Timestamp.from(day.atStartOfDay().toInstant(ZoneOffset.UTC)),
            Timestamp.from(day.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC)),
        )
        audit(session, "appointment.list", null, "Appointment")
        return rows
    }

    @Transactional
    fun endSession(sessionId: String) {
        if (!SESSION_ID.matches(sessionId)) throw InvalidDirectoryUserException()
        val row = jdbc.query(
            """
            SELECT s.user_id, u.organization_id
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.id = ? AND s.ended_at IS NULL
            """.trimIndent(),
            { rs, _ -> rs.getString("user_id") to rs.getString("organization_id") },
            sessionId,
        ).firstOrNull() ?: return
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        jdbc.update("UPDATE sessions SET ended_at = ? WHERE id = ? AND ended_at IS NULL", now, sessionId)
        jdbc.update(
            """
            INSERT INTO audit_events
              (id, organization_id, actor_id, action, resource_type, resource_id, outcome, created_at)
            VALUES (?, ?, ?, 'session.end', 'session', ?, 'success', ?)
            """.trimIndent(),
            "aud_${UUID.randomUUID()}",
            row.second,
            row.first,
            sessionId,
            now,
        )
    }

    private fun directoryRow(userId: String): DirectoryPerson? {
        return jdbc.query(
            """
            SELECT u.id, u.display_name, u.role, u.organization_id, o.name AS organization_name,
                   u.facility_id, f.name AS facility_name
            FROM users u
            JOIN organizations o ON o.id = u.organization_id
            LEFT JOIN facilities f ON f.id = u.facility_id
            WHERE u.id = ?
            """.trimIndent(),
            { rs, _ ->
                DirectoryPerson(
                    userId = rs.getString("id"),
                    displayName = rs.getString("display_name"),
                    role = rs.getString("role"),
                    organizationId = rs.getString("organization_id"),
                    organizationName = rs.getString("organization_name"),
                    facilityId = rs.getString("facility_id"),
                    facilityName = rs.getString("facility_name"),
                )
            },
            userId,
        ).firstOrNull()
    }

    private fun assertDevelopmentDirectory() {
        if (environment == "production") throw DirectoryDisabledException()
    }

    private fun purposeFor(role: String) = when (role) {
        "auditor" -> "AUDIT"
        "admin" -> "OPERATIONS"
        else -> "TREATMENT"
    }

    private fun canReadChart(session: WorkforceSession) =
        (session.role == "clinician" || session.role == "nurse" || session.role == "admin") && session.facilityId != null

    private fun canRegisterPatient(session: WorkforceSession) =
        (session.role == "clinician" || session.role == "admin") && session.facilityId != null

    private fun toPatient(id: String, mrn: String, givenName: String, familyName: String, birthDate: String, sex: String) =
        PatientRecord(id, mrn, givenName, familyName, birthDate, sex, ageYears(LocalDate.parse(birthDate)))

    private fun cleanName(value: String?): String {
        val trimmed = value.orEmpty().trim().replace(Regex("\\s+"), " ")
        if (trimmed.length !in 1..80) throw InvalidDirectoryUserException()
        return trimmed
    }

    private fun birthDate(value: String?): LocalDate {
        val text = value.orEmpty()
        if (!BIRTH_DATE.matches(text)) throw InvalidDirectoryUserException()
        val parsed = try {
            LocalDate.parse(text)
        } catch (_: Exception) {
            throw InvalidDirectoryUserException()
        }
        val today = LocalDate.now(ZoneOffset.UTC)
        if (parsed.year < 1900 || parsed.isAfter(today)) throw InvalidDirectoryUserException()
        return parsed
    }

    private fun sex(value: String?) = when (value) {
        "female", "male", "other", "unknown" -> value
        else -> throw InvalidDirectoryUserException()
    }

    private fun ageYears(birth: LocalDate, today: LocalDate = LocalDate.now(ZoneOffset.UTC)): Int {
        var age = today.year - birth.year
        if (today.monthValue < birth.monthValue || (today.monthValue == birth.monthValue && today.dayOfMonth < birth.dayOfMonth)) age -= 1
        return age
    }

    private fun readableChart(sessionId: String): WorkforceSession {
        val session = readSession(sessionId) ?: throw UnknownDirectoryUserException()
        if (!canReadChart(session) || session.facilityId == null) throw ChartForbiddenException()
        return session
    }

    private fun readingInstant(value: String): Instant {
        val instant = visitInstant(value)
        if (instant.isAfter(Instant.now().plus(24, ChronoUnit.HOURS))) throw ObservationRangeException()
        return instant
    }

    private fun visitInstant(value: String?): Instant {
        val text = value?.trim().orEmpty()
        if (!text.endsWith("Z")) throw InvalidDirectoryUserException()
        return try {
            Instant.parse(text)
        } catch (_: java.time.format.DateTimeParseException) {
            throw InvalidDirectoryUserException()
        }
    }

    private fun prescriptionDose(value: String?): String {
        val text = value.orEmpty().trim()
        if (text.length !in 1..80 || text.contains('\n') || text.contains('\r')) throw InvalidDirectoryUserException()
        return text
    }

    private fun prescriptionWarnings(session: WorkforceSession, patientId: String, drug: RxDrug): List<RxDraft> {
        val allergies = jdbc.query(
            """
            SELECT display FROM allergies
            WHERE organization_id = ? AND facility_id = ? AND patient_id = ?
            ORDER BY recorded_at
            """.trimIndent(),
            { rs, _ -> rs.getString("display") },
            session.organizationId,
            session.facilityId,
            patientId,
        )
        val active = jdbc.query(
            """
            SELECT display FROM medications
            WHERE organization_id = ? AND facility_id = ? AND patient_id = ? AND status = 'active'
            ORDER BY recorded_at
            """.trimIndent(),
            { rs, _ -> rs.getString("display") },
            session.organizationId,
            session.facilityId,
            patientId,
        )
        val classes = active.mapNotNull { display ->
            RX_FORMULARY.firstOrNull { it.display.equals(display, ignoreCase = true) }
        }
        val warnings = mutableListOf<RxDraft>()
        for (rule in RX_RULES) {
            when (rule.kind) {
                "allergy" -> {
                    val hit = allergies.firstOrNull { it.equals(rule.left, ignoreCase = true) }
                    if (hit != null && drug.therapyClass == rule.right) {
                        warnings.add(RxDraft("allergy", rule.severity, rule.id, "Allergy $hit is stored. ${drug.display} is in class ${drug.therapyClass} on rule $MED_SAFETY_VERSION."))
                    }
                }
                "interaction" -> {
                    val other = classes.firstOrNull { pairMatches(rule.left, rule.right, it.therapyClass, drug.therapyClass) }
                    if (other != null) {
                        warnings.add(RxDraft("interaction", rule.severity, rule.id, "${other.display} class ${other.therapyClass} and ${drug.display} class ${drug.therapyClass} are paired on rule $MED_SAFETY_VERSION."))
                    }
                }
                "duplicate" -> {
                    val other = classes.firstOrNull { it.therapyClass == drug.therapyClass }
                    if (other != null) {
                        warnings.add(RxDraft("duplicate", rule.severity, rule.id, "${other.display} and ${drug.display} are both class ${drug.therapyClass} on rule $MED_SAFETY_VERSION."))
                    }
                }
                "formulary" -> {
                    if (drug.status == rule.left) {
                        warnings.add(RxDraft("formulary", rule.severity, rule.id, "${drug.display} is non-formulary on $FORMULARY_VERSION."))
                    }
                }
            }
        }
        return warnings
    }

    private fun pairMatches(left: String, right: String, a: String, b: String) =
        (left == a && right == b) || (left == b && right == a)

    private fun cleanChartText(value: String?, min: Int, max: Int): String {
        val trimmed = value.orEmpty().trim().replace(Regex("\\s+"), " ")
        if (trimmed.length !in min..max) throw InvalidDirectoryUserException()
        if (Regex("\\d{13,19}").containsMatchIn(trimmed.replace(Regex("[\\s-]"), ""))) throw InvalidDirectoryUserException()
        return trimmed
    }

    private fun cleanReason(value: String?): String {
        val trimmed = value.orEmpty().trim().replace(Regex("\\s+"), " ")
        if (trimmed.length !in 3..200) throw InvalidDirectoryUserException()
        return trimmed
    }

    private fun idempotencyKey(value: String?): String {
        val key = value ?: ""
        if (!IDEMPOTENCY_KEY.matches(key)) throw InvalidDirectoryUserException()
        return key
    }

    private fun <T> replay(session: WorkforceSession, key: String, hash: String, type: Class<T>): T? {
        val existing = jdbc.query(
            """
            SELECT request_hash, response_json::text AS response_json
            FROM idempotency_keys
            WHERE organization_id = ? AND idempotency_key = ?
            """.trimIndent(),
            { rs, _ -> rs.getString("request_hash") to rs.getString("response_json") },
            session.organizationId,
            key,
        ).firstOrNull() ?: return null
        if (existing.first != hash) throw DuplicateSubmissionException()
        return json.readValue(existing.second, type)
    }

    private fun remember(session: WorkforceSession, key: String, hash: String, response: Any) {
        jdbc.update(
            """
            INSERT INTO idempotency_keys (
              organization_id, idempotency_key, actor_id, request_hash, response_json, created_at
            ) VALUES (?, ?, ?, ?, CAST(? AS jsonb), ?)
            """.trimIndent(),
            session.organizationId,
            key,
            session.userId,
            hash,
            json.writeValueAsString(response),
            OffsetDateTime.now(ZoneOffset.UTC),
        )
    }

    private fun patientOnFacility(session: WorkforceSession, patientId: String): Boolean {
        val visible = jdbc.queryForObject(
            """
            SELECT COUNT(*) FROM patients
            WHERE id = ? AND organization_id = ? AND facility_id = ?
            """.trimIndent(),
            Int::class.java,
            patientId,
            session.organizationId,
            session.facilityId,
        ) ?: 0
        return visible == 1
    }

    private data class ObservationPin(
        val display: String,
        val unit: String,
        val low: BigDecimal?,
        val high: BigDecimal?,
        val min: BigDecimal,
        val max: BigDecimal,
    )

    private fun observationPin(facilityId: String, code: String): ObservationPin? {
        return jdbc.query(
            """
            SELECT p.display, p.unit, p.low_bound, p.high_bound, p.entry_min, p.entry_max
            FROM observation_pins p
            JOIN facility_observation_catalogs f ON f.catalog = p.catalog
            WHERE p.code = ? AND f.facility_id = ?
            """.trimIndent(),
            { rs, _ ->
                ObservationPin(
                    display = rs.getString("display"),
                    unit = rs.getString("unit"),
                    low = rs.getBigDecimal("low_bound"),
                    high = rs.getBigDecimal("high_bound"),
                    min = rs.getBigDecimal("entry_min"),
                    max = rs.getBigDecimal("entry_max"),
                )
            },
            code,
            facilityId,
        ).firstOrNull()
    }

    private fun interpretPin(pin: ObservationPin, value: BigDecimal): Pair<String, String> {
        if (pin.high != null && value > pin.high) {
            return "high" to "above ${plain(pin.high)} ${pin.unit}"
        }
        if (pin.low != null && value < pin.low) {
            return "low" to "below ${plain(pin.low)} ${pin.unit}"
        }
        return "normal" to "inside the configured bounds"
    }

    private fun plain(value: BigDecimal) = value.stripTrailingZeros().toPlainString()

    private fun codeSystemLabel(uri: String) = when (uri) {
        "http://loinc.org" -> "LOINC"
        "http://hl7.org/fhir/sid/icd-10-cm" -> "ICD-10-CM"
        "http://unitsofmeasure.org" -> "UCUM"
        else -> uri
    }

    private fun audit(session: WorkforceSession, action: String, resourceId: String?, resourceType: String = "encounter") {
        jdbc.update(
            """
            INSERT INTO audit_events
              (id, organization_id, actor_id, action, resource_type, resource_id, outcome, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'success', ?)
            """.trimIndent(),
            "aud_${UUID.randomUUID()}",
            session.organizationId,
            session.userId,
            action,
            resourceType,
            resourceId,
            OffsetDateTime.now(ZoneOffset.UTC),
        )
    }

    private fun outbox(session: WorkforceSession, eventType: String, fields: Map<String, String>) {
        val payload = mapOf(
            "organizationId" to session.organizationId,
            "facilityId" to session.facilityId,
        ) + fields
        jdbc.update(
            """
            INSERT INTO outbox (id, organization_id, event_type, payload, created_at)
            VALUES (?, ?, ?, CAST(? AS jsonb), ?)
            """.trimIndent(),
            "out_${UUID.randomUUID()}",
            session.organizationId,
            eventType,
            json.writeValueAsString(payload),
            OffsetDateTime.now(ZoneOffset.UTC),
        )
    }

    private fun iso(value: Timestamp): String =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC).format(value.toInstant())

    private fun requestHash(fields: List<Pair<String, String>>): String {
        val canonical = fields.sortedBy { it.first }.joinToString(prefix = "{", postfix = "}") { (key, value) ->
            "\"${escapeJson(key)}\":\"${escapeJson(value)}\""
        }
        val digest = MessageDigest.getInstance("SHA-256").digest(canonical.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun escapeJson(value: String) = value.replace("\\", "\\\\").replace("\"", "\\\"")

    private companion object {
        private data class RxDrug(val id: String, val display: String, val therapyClass: String, val status: String)
        private data class RxRule(val id: String, val kind: String, val left: String, val right: String, val severity: String)
        private data class RxDraft(val kind: String, val severity: String, val ruleId: String, val summary: String)
        val USER_ID = Regex("^[A-Za-z0-9_-]{1,80}$")
        val SESSION_ID = Regex("^ses_[0-9a-fA-F-]{36}$")
        val IDEMPOTENCY_KEY = Regex("^[A-Za-z0-9_-]{8,80}$")
        val BIRTH_DATE = Regex("^\\d{4}-\\d{2}-\\d{2}$")
        val PATIENT_ID = Regex("^[A-Za-z0-9_-]{1,80}$")
        val ORDER_ID = Regex("^ord_[A-Za-z0-9_-]{1,80}$")
        val RX_ORDER_ID = Regex("^rxo_[A-Za-z0-9_-]{1,80}$")
        val WARNING_ID = Regex("^rxw_[A-Za-z0-9_-]{1,80}$")
        val MEDICATION_ID = Regex("^med_[A-Za-z0-9_-]{1,80}$")
        val OBSERVATION_ID = Regex("^obs_[A-Za-z0-9_-]{1,80}$")
        const val MED_SAFETY_VERSION = "med-safety-2026.10"
        const val FORMULARY_VERSION = "formulary-2026.10"
        val RX_FORMULARY = listOf(
            RxDrug("frm_furosemide", "Furosemide", "loop-diuretic", "on-formulary"),
            RxDrug("frm_torsemide", "Torsemide", "loop-diuretic", "on-formulary"),
            RxDrug("frm_metformin", "Metformin", "biguanide", "on-formulary"),
            RxDrug("frm_amoxicillin", "Amoxicillin", "penicillin", "on-formulary"),
            RxDrug("frm_warfarin", "Warfarin", "anticoagulant", "on-formulary"),
            RxDrug("frm_ibuprofen", "Ibuprofen", "nsaid", "non-formulary"),
        )
        val RX_RULES = listOf(
            RxRule("alg_penicillin", "allergy", "Penicillin", "penicillin", "high"),
            RxRule("int_anticoag_nsaid", "interaction", "anticoagulant", "nsaid", "high"),
            RxRule("dup_class", "duplicate", "*", "*", "high"),
            RxRule("frm_nonformulary", "formulary", "non-formulary", "", "moderate"),
        )
        const val LAB_RULE_VERSION = "lab-critical-2026.10"
        private data class CriticalPin(val code: String, val low: BigDecimal, val high: BigDecimal)
        val CRITICAL_PINS = listOf(
            CriticalPin("2823-3", BigDecimal("2.5"), BigDecimal("6")),
            CriticalPin("2345-7", BigDecimal("40"), BigDecimal("500")),
        )
        const val ICD_SYSTEM = "http://hl7.org/fhir/sid/icd-10-cm"
        const val ICD_VERSION = "2026"
        val CONDITION_PINS = listOf(
            "E11.9" to "Type 2 diabetes mellitus",
            "I50.9" to "Heart failure",
            "J45.909" to "Asthma",
            "I10" to "Essential hypertension",
            "J30.2" to "Seasonal allergic rhinitis",
            "M54.5" to "Low back pain",
        )
        val ENCOUNTER_ID = Regex("^enc_[A-Za-z0-9_-]{1,80}$")
    }
}
