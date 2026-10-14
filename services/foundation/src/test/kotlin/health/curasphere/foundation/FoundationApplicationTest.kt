package health.curasphere.foundation

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import java.math.BigDecimal

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class FoundationApplicationTest {
    @Autowired
    lateinit var http: TestRestTemplate

    @Autowired
    lateinit var jdbc: JdbcTemplate

    @BeforeEach
    fun clearRuntimeRows() {
        jdbc.update("DELETE FROM outbox")
        jdbc.update("DELETE FROM audit_events")
        jdbc.update("DELETE FROM rx_warnings")
        jdbc.update("DELETE FROM rx_dispenses")
        jdbc.update("DELETE FROM rx_administrations")
        jdbc.update("DELETE FROM rx_orders")
        jdbc.update("DELETE FROM lab_alerts")
        jdbc.update("DELETE FROM lab_results")
        jdbc.update(
            """
            DELETE FROM observations
            WHERE id NOT IN (
              'obs_elena_k_normal', 'obs_elena_k_high', 'obs_elena_bnp', 'obs_elena_sbp',
              'obs_mateo_spo2', 'obs_helen_sbp', 'obs_helen_dbp',
              'obs_jonah_sbp', 'obs_camille_spo2', 'obs_owen_glucose', 'obs_sofia_hr',
              'obs_walter_bnp', 'obs_walter_sbp', 'obs_amina_hr', 'obs_farah_sbp',
              'obs_luis_glucose', 'obs_grace_sbp', 'obs_ben_spo2'
            )
            """.trimIndent(),
        )
        jdbc.update(
            """
            DELETE FROM encounters
            WHERE id NOT IN ('enc_elena', 'enc_mateo', 'enc_helen')
            """.trimIndent(),
        )
        jdbc.update(
            """
            DELETE FROM appointments
            WHERE id NOT IN (
              'apt_elena', 'apt_helen', 'apt_jonah', 'apt_camille', 'apt_owen', 'apt_sofia',
              'apt_walter', 'apt_amina', 'apt_farah', 'apt_luis', 'apt_grace', 'apt_ben'
            )
            """.trimIndent(),
        )
        jdbc.update("DELETE FROM lab_specimens")
        jdbc.update("DELETE FROM lab_orders")
        jdbc.update("DELETE FROM conditions WHERE id LIKE '%-%'")
        jdbc.update("DELETE FROM allergies WHERE id LIKE '%-%'")
        jdbc.update("DELETE FROM medications WHERE id LIKE '%-%'")
        jdbc.update("DELETE FROM idempotency_keys")
        val keepPatients = """
            'pat_elena', 'pat_mateo', 'pat_helen', 'pat_noor', 'pat_samir',
            'pat_jonah', 'pat_camille', 'pat_owen', 'pat_sofia', 'pat_walter', 'pat_amina',
            'pat_farah', 'pat_luis', 'pat_grace', 'pat_ben'
        """.trimIndent()
        jdbc.update("DELETE FROM appointments WHERE patient_id NOT IN ($keepPatients)")
        jdbc.update("DELETE FROM medications WHERE patient_id NOT IN ($keepPatients)")
        jdbc.update("DELETE FROM allergies WHERE patient_id NOT IN ($keepPatients)")
        jdbc.update("DELETE FROM conditions WHERE patient_id NOT IN ($keepPatients)")
        jdbc.update("DELETE FROM patients WHERE id NOT IN ($keepPatients)")
        jdbc.update("DELETE FROM sessions")
    }

    @Test
    fun healthReadsThePostgresSchema() {
        val body = http.getForEntity("/health", FoundationHealth::class.java)
        assertEquals(HttpStatus.OK, body.statusCode)
        assertEquals(true, body.body?.ok)
        assertEquals(15, body.body?.schemaVersion)
        assertEquals("postgresql", body.body?.store)
        val browser = HttpEntity<Void>(HttpHeaders().apply { accept = listOf(MediaType.TEXT_HTML) })
        val root = http.exchange("/", HttpMethod.GET, browser, FoundationHealth::class.java)
        assertEquals(HttpStatus.OK, root.statusCode)
        assertEquals("postgresql", root.body?.store)
        val missing = http.exchange("/no-such-page", HttpMethod.GET, browser, String::class.java)
        assertEquals(HttpStatus.NOT_FOUND, missing.statusCode)
        assertEquals(false, missing.body?.contains("Whitelabel"))
    }

    @Test
    fun directoryReturnsTheSyntheticWorkforce() {
        val people = http.getForObject("/directory", Array<DirectoryPerson>::class.java).toList()
        assertTrue(people.any { it.userId == "usr_amira" && it.facilityId == "fac_riverside" })
        assertTrue(people.any { it.userId == "usr_evan" && it.organizationId == "org_northwind" })
        assertFalse(people.joinToString(" ") { it.displayName }.contains("Elena"))
    }

    @Test
    fun signInWritesASessionAuditAndOutboxRow() {
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_priya"), OpenedSession::class.java)
        assertEquals(HttpStatus.OK, opened.statusCode)
        val sessionId = opened.body?.sessionId ?: error("missing session")
        assertEquals("usr_priya", opened.body?.userId)
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM sessions WHERE id = ?", Int::class.java, sessionId))
        assertEquals(
            1,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM audit_events WHERE action = 'session.open' AND resource_id = ?",
                Int::class.java,
                sessionId,
            ),
        )
        assertEquals(
            1,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM outbox WHERE event_type = 'session.opened'",
                Int::class.java,
            ),
        )
        val live = http.getForEntity("/sessions/$sessionId", WorkforceSession::class.java)
        assertEquals(HttpStatus.OK, live.statusCode)
        assertEquals("usr_priya", live.body?.userId)
        assertEquals("AUDIT", live.body?.purposeOfUse)
        assertEquals(null, live.body?.facilityId)
        http.postForEntity("/sessions/$sessionId/end", null, Void::class.java)
        assertEquals(HttpStatus.NOT_FOUND, http.getForEntity("/sessions/$sessionId", String::class.java).statusCode)
        assertEquals(
            1,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM sessions WHERE id = ? AND ended_at IS NOT NULL",
                Int::class.java,
                sessionId,
            ),
        )
    }

    @Test
    fun anOldSessionIsNotReadable() {
        jdbc.update(
            """
            INSERT INTO sessions (id, user_id, created_at)
            VALUES ('ses_00000000-0000-4000-8000-000000000001', 'usr_amira', now() - interval '13 hours')
            """.trimIndent(),
        )
        val response = http.getForEntity("/sessions/ses_00000000-0000-4000-8000-000000000001", String::class.java)
        assertEquals(HttpStatus.NOT_FOUND, response.statusCode)
    }

    @Test
    fun thePatientListIsTheSessionFacility() {
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_amira"), OpenedSession::class.java)
        val sessionId = opened.body?.sessionId ?: error("missing session")
        val people = http.getForObject("/sessions/$sessionId/patients", Array<PatientRecord>::class.java).toList()
        assertTrue(people.any { it.id == "pat_elena" && it.mrn == "RIV-1001" && it.ageYears == 67 })
        assertFalse(people.any { it.id == "pat_samir" || it.id == "pat_noor" })
        val searched = http.getForObject("/sessions/$sessionId/patients?q=park", Array<PatientRecord>::class.java).toList()
        assertEquals(listOf("pat_helen"), searched.map { it.id })
    }

    @Test
    fun registrationStaysOnTheSessionFacility() {
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_amira"), OpenedSession::class.java)
        val sessionId = opened.body?.sessionId ?: error("missing session")
        val body = RegisterPatientBody("Ada", "Lovelace", "1991-12-10", "female", "register-ada-001")
        val created = http.postForEntity("/sessions/$sessionId/patients", body, PatientRecord::class.java)
        assertEquals(HttpStatus.OK, created.statusCode)
        assertEquals("RIV-1010", created.body?.mrn)
        assertTrue(created.body?.id?.startsWith("pat_") == true)
        val replay = http.postForEntity("/sessions/$sessionId/patients", body, PatientRecord::class.java)
        assertEquals(created.body?.id, replay.body?.id)
        val conflict = http.postForEntity(
            "/sessions/$sessionId/patients",
            RegisterPatientBody("Ada", "King", "1991-12-10", "female", "register-ada-001"),
            String::class.java,
        )
        assertEquals(HttpStatus.CONFLICT, conflict.statusCode)
        assertEquals(
            "org_harborlight",
            jdbc.queryForObject("SELECT organization_id FROM patients WHERE id = ?", String::class.java, created.body?.id),
        )
        assertEquals(
            1,
            jdbc.queryForObject("SELECT COUNT(*) FROM outbox WHERE event_type = 'patient.registered'", Int::class.java),
        )
        val nurse = http.postForEntity("/sessions", OpenSessionBody("usr_jordan"), OpenedSession::class.java)
        val refused = http.postForEntity(
            "/sessions/${nurse.body?.sessionId}/patients",
            body,
            String::class.java,
        )
        assertEquals(HttpStatus.FORBIDDEN, refused.statusCode)
    }

    @Test
    fun anOpenEncounterStaysOnTheSessionFacility() {
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_amira"), OpenedSession::class.java)
        val sessionId = opened.body?.sessionId ?: error("missing session")
        val board = http.getForObject("/sessions/$sessionId/encounters", Array<OpenEncounterView>::class.java).toList()
        assertTrue(board.any { it.id == "enc_mateo" && it.patientId == "pat_mateo" && it.version == 1 })
        assertFalse(board.any { it.id == "enc_elena" })
        val again = http.postForEntity(
            "/sessions/$sessionId/encounters",
            OpenEncounterBody("pat_mateo", "Another wheeze", "open-mateo-again"),
            String::class.java,
        )
        assertEquals(HttpStatus.CONFLICT, again.statusCode)
        val created = http.postForEntity(
            "/sessions/$sessionId/encounters",
            OpenEncounterBody("pat_helen", "Pressure check today", "open-helen-001"),
            OpenedEncounter::class.java,
        )
        assertEquals(HttpStatus.OK, created.statusCode)
        assertEquals(1, created.body?.version)
        val stale = http.postForEntity(
            "/sessions/$sessionId/encounters/${created.body?.id}/finish",
            FinishEncounterBody(2, "finish-helen-001"),
            String::class.java,
        )
        assertEquals(HttpStatus.CONFLICT, stale.statusCode)
        val finished = http.postForEntity(
            "/sessions/$sessionId/encounters/${created.body?.id}/finish",
            FinishEncounterBody(1, "finish-helen-002"),
            FinishedEncounter::class.java,
        )
        assertEquals(HttpStatus.OK, finished.statusCode)
        assertEquals(2, finished.body?.version)
        val after = http.getForObject("/sessions/$sessionId/encounters", Array<OpenEncounterView>::class.java).toList()
        assertFalse(after.any { it.id == created.body?.id })
        val elsewhere = http.postForEntity(
            "/sessions/$sessionId/encounters",
            OpenEncounterBody("pat_samir", "Wrong facility", "open-samir-001"),
            String::class.java,
        )
        assertEquals(HttpStatus.NOT_FOUND, elsewhere.statusCode)
    }

    @Test
    fun aResultStaysOnTheSessionFacilityCatalog() {
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_amira"), OpenedSession::class.java)
        val sessionId = opened.body?.sessionId ?: error("missing session")
        val listed = http.getForObject("/sessions/$sessionId/patients/pat_elena/observations", Array<ChartObservationView>::class.java).toList()
        assertTrue(listed.any { it.id == "obs_elena_k_high" && it.value == 5.4 && it.codeSystemLabel == "LOINC" && it.authorName == "Amira Solano" })
        assertFalse(listed.any { it.id == "obs_mateo_spo2" })
        val body = RecordObservationBody("2823-3", BigDecimal("4.4"), "obs-elena-k-044")
        val created = http.postForEntity("/sessions/$sessionId/patients/pat_elena/observations", body, RecordedObservation::class.java)
        assertEquals(HttpStatus.OK, created.statusCode)
        assertTrue(created.body?.id?.startsWith("obs_") == true)
        assertEquals("normal", created.body?.interpretation)
        val replay = http.postForEntity("/sessions/$sessionId/patients/pat_elena/observations", body, RecordedObservation::class.java)
        assertEquals(created.body?.id, replay.body?.id)
        val changed = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/observations",
            RecordObservationBody("2823-3", BigDecimal("4.5"), "obs-elena-k-044"),
            String::class.java,
        )
        assertEquals(HttpStatus.CONFLICT, changed.statusCode)
        val wide = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/observations",
            RecordObservationBody("2823-3", BigDecimal("40"), "obs-elena-k-wide"),
            String::class.java,
        )
        assertEquals(HttpStatus.BAD_REQUEST, wide.statusCode)
        assertTrue(wide.body?.contains("\"range\"") == true)
        val nurse = http.postForEntity("/sessions", OpenSessionBody("usr_jordan"), OpenedSession::class.java)
        val recorded = http.postForEntity(
            "/sessions/${nurse.body?.sessionId}/patients/pat_elena/observations",
            RecordObservationBody("8867-4", BigDecimal("72"), "obs-elena-hr-072"),
            RecordedObservation::class.java,
        )
        assertEquals(HttpStatus.OK, recorded.statusCode)
        val lakeside = http.postForEntity("/sessions", OpenSessionBody("usr_evan"), OpenedSession::class.java)
        val bnp = http.postForEntity(
            "/sessions/${lakeside.body?.sessionId}/patients/pat_samir/observations",
            RecordObservationBody("30934-4", BigDecimal("50"), "obs-samir-bnp-50"),
            String::class.java,
        )
        assertEquals(HttpStatus.BAD_REQUEST, bnp.statusCode)
        assertTrue(bnp.body?.contains("\"code\"") == true)
        val east = http.postForEntity("/sessions", OpenSessionBody("usr_lea"), OpenedSession::class.java)
        val hidden = http.getForEntity("/sessions/${east.body?.sessionId}/patients/pat_elena/observations", String::class.java)
        assertEquals(HttpStatus.NOT_FOUND, hidden.statusCode)
        val payload = jdbc.queryForObject(
            "SELECT payload::text FROM outbox WHERE event_type = 'observation.recorded' AND payload->>'observationId' = ?",
            String::class.java,
            created.body?.id,
        )
        assertEquals(false, payload?.contains("4.4"))
        assertEquals(
            1,
            jdbc.queryForObject("SELECT COUNT(*) FROM observations WHERE id = ?", Int::class.java, created.body?.id),
        )
    }

    @Test
    fun theClinicDayStaysOnTheSessionFacility() {
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_amira"), OpenedSession::class.java)
        val sessionId = opened.body?.sessionId ?: error("missing session")
        val core = http.getForObject("/sessions/$sessionId/patients/pat_elena/core", ChartCoreView::class.java)
        assertTrue(core.conditions.any { it.id == "con_elena_dm" && it.codeSystemLabel == "ICD-10-CM" && it.clinicalStatus == "active" })
        assertTrue(core.conditions.any { it.id == "con_elena_hf" })
        assertFalse(core.conditions.any { it.id == "con_samir" })
        assertTrue(core.allergies.any { it.id == "all_elena" && it.display == "Penicillin" && it.criticality == "high" })
        assertTrue(core.medications.any { it.id == "med_elena_metformin" && it.dose == "500 mg twice daily" })
        assertTrue(core.appointments.any { it.id == "apt_elena" })
        val walter = http.getForObject("/sessions/$sessionId/patients/pat_walter/core", ChartCoreView::class.java)
        assertTrue(walter.conditions.any { it.code == "I50.9" })
        assertTrue(walter.medications.any { it.display == "Furosemide" && it.dose == "20 mg daily" })
        val board = http.getForObject("/sessions/$sessionId/appointments?day=2026-10-08", Array<FacilityAppointmentView>::class.java).toList()
        val otherDay = http.getForObject("/sessions/$sessionId/appointments?day=2026-10-09", Array<FacilityAppointmentView>::class.java).toList()
        assertFalse(otherDay.any { it.id == "apt_jonah" })
        val badDay = http.getForEntity("/sessions/$sessionId/appointments?day=2026-13-40", String::class.java)
        assertEquals(HttpStatus.BAD_REQUEST, badDay.statusCode)
        val catalog = http.getForObject("/sessions/$sessionId/catalog", Array<CatalogChoice>::class.java).toList()
        assertTrue(catalog.any { it.code == "30934-4" && it.display == "BNP" })
        assertTrue(board.any { it.id == "apt_jonah" && it.patientName == "Jonah Adler" && it.mrn == "RIV-2001" })
        assertTrue(board.any { it.id == "apt_elena" })
        assertFalse(board.any { it.id == "apt_farah" || it.id == "apt_grace" })
        val east = http.postForEntity("/sessions", OpenSessionBody("usr_lea"), OpenedSession::class.java)
        val hidden = http.getForEntity("/sessions/${east.body?.sessionId}/patients/pat_elena/core", String::class.java)
        assertEquals(HttpStatus.NOT_FOUND, hidden.statusCode)
        val eastBoard = http.getForObject("/sessions/${east.body?.sessionId}/appointments?day=2026-10-08", Array<FacilityAppointmentView>::class.java).toList()
        assertTrue(eastBoard.any { it.id == "apt_farah" && it.patientId == "pat_farah" })
        assertFalse(eastBoard.any { it.patientId == "pat_elena" })
        val lakeside = http.postForEntity("/sessions", OpenSessionBody("usr_evan"), OpenedSession::class.java)
        val lakesideCatalog = http.getForObject(
            "/sessions/${lakeside.body?.sessionId}/catalog",
            Array<CatalogChoice>::class.java,
        ).toList()
        assertFalse(lakesideCatalog.any { it.code == "30934-4" })
        val timeline = http.getForObject("/sessions/$sessionId/patients/pat_elena/timeline", PatientTimelineView::class.java)
        assertEquals("all", timeline.group)
        assertEquals("2026-09-01T16:00:00.000Z", timeline.since)
        assertTrue(timeline.events.any { it.id == "tl-enc_elena" && it.sourceTable == "encounters" && it.kind == "encounter" })
        assertTrue(timeline.events.any { it.id == "tl-obs_elena_k_high" && it.abnormal && it.title == "Potassium · 5.4 mmol/L" })
        assertTrue(timeline.events.none { it.sourceId == "con_samir" })
        assertTrue(timeline.days.first().day >= timeline.days.last().day)
        assertTrue(timeline.changes.all { change -> timeline.events.any { it.sourceId == change.sourceId && it.sourceTable == change.sourceTable } })
        val results = http.getForObject("/sessions/$sessionId/patients/pat_elena/timeline?group=results", PatientTimelineView::class.java)
        assertTrue(results.events.isNotEmpty())
        assertTrue(results.events.all { it.kind == "observation" && it.sourceTable == "observations" })
        val unknown = http.getForEntity("/sessions/$sessionId/patients/pat_elena/timeline?group=generated", String::class.java)
        assertEquals(HttpStatus.BAD_REQUEST, unknown.statusCode)
        val hiddenTimeline = http.getForEntity("/sessions/${east.body?.sessionId}/patients/pat_elena/timeline", String::class.java)
        assertEquals(HttpStatus.NOT_FOUND, hiddenTimeline.statusCode)
    }

    @Test
    fun aBookedVisitIsStoredForTheSessionFacility() {
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_amira"), OpenedSession::class.java)
        val sessionId = opened.body?.sessionId ?: error("missing session")
        val body = BookAppointmentBody(
            patientId = "pat_elena",
            reason = "Device check follow-up",
            startsAt = "2026-10-20T15:00:00.000Z",
            endsAt = "2026-10-20T15:20:00.000Z",
            idempotencyKey = "book-visit-0001",
        )
        val created = http.postForEntity("/sessions/$sessionId/appointments", body, BookedAppointment::class.java)
        assertEquals(HttpStatus.OK, created.statusCode)
        val id = created.body?.id ?: error("missing appointment")
        assertTrue(id.startsWith("apt_"))
        assertEquals("booked", created.body?.status)
        val replay = http.postForEntity("/sessions/$sessionId/appointments", body, BookedAppointment::class.java)
        assertEquals(id, replay.body?.id)
        val changed = http.postForEntity(
            "/sessions/$sessionId/appointments",
            BookAppointmentBody(
                "pat_elena",
                "Device check follow-up",
                "2026-10-21T15:00:00.000Z",
                "2026-10-21T15:20:00.000Z",
                "book-visit-0001",
            ),
            String::class.java,
        )
        assertEquals(HttpStatus.CONFLICT, changed.statusCode)
        val board = http.getForObject("/sessions/$sessionId/appointments?day=2026-10-20", Array<FacilityAppointmentView>::class.java).toList()
        assertTrue(board.any { it.id == id && it.patientId == "pat_elena" })
        val other = http.getForObject("/sessions/$sessionId/appointments?day=2026-10-08", Array<FacilityAppointmentView>::class.java).toList()
        assertFalse(other.any { it.id == id })
        val timeline = http.getForObject("/sessions/$sessionId/patients/pat_elena/timeline?group=visits", PatientTimelineView::class.java)
        assertTrue(timeline.events.any { it.sourceId == id && it.sourceTable == "appointments" && it.title == "Appointment · Device check follow-up" })
        val payload = jdbc.queryForObject(
            "SELECT payload::text FROM outbox WHERE event_type = 'appointment.booked' AND payload->>'appointmentId' = ?",
            String::class.java,
            id,
        )
        assertEquals(false, payload?.contains("Device"))
        val nurse = http.postForEntity("/sessions", OpenSessionBody("usr_jordan"), OpenedSession::class.java)
        val refused = http.postForEntity(
            "/sessions/${nurse.body?.sessionId}/appointments",
            BookAppointmentBody(
                "pat_elena",
                "Device check follow-up",
                "2026-10-20T16:00:00.000Z",
                "2026-10-20T16:20:00.000Z",
                "book-visit-0002",
            ),
            String::class.java,
        )
        assertEquals(HttpStatus.FORBIDDEN, refused.statusCode)
        val east = http.postForEntity("/sessions", OpenSessionBody("usr_lea"), OpenedSession::class.java)
        val hidden = http.postForEntity(
            "/sessions/${east.body?.sessionId}/appointments",
            BookAppointmentBody(
                "pat_elena",
                "Device check follow-up",
                "2026-10-20T16:00:00.000Z",
                "2026-10-20T16:20:00.000Z",
                "book-visit-0003",
            ),
            String::class.java,
        )
        assertEquals(HttpStatus.NOT_FOUND, hidden.statusCode)
        val bad = http.postForEntity(
            "/sessions/$sessionId/appointments",
            BookAppointmentBody(
                "pat_elena",
                "Device check follow-up",
                "2026-10-20T17:00:00.000Z",
                "2026-10-20T16:00:00.000Z",
                "book-visit-0004",
            ),
            String::class.java,
        )
        assertEquals(HttpStatus.BAD_REQUEST, bad.statusCode)
    }

    @Test
    fun aNewProblemAllergyAndMedicationStayOnTheSessionFacility() {
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_amira"), OpenedSession::class.java)
        val sessionId = opened.body?.sessionId ?: error("missing session")
        val catalog = http.getForObject("/sessions/$sessionId/condition-catalog", Array<ConditionChoice>::class.java).toList()
        assertTrue(catalog.any { it.code == "E11.9" && it.display == "Type 2 diabetes mellitus" && it.codeSystemLabel == "ICD-10-CM" && it.codeSystemVersion == "2026" })
        val condition = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/conditions",
            RecordConditionBody("E11.9", "chart-con-00001"),
            RecordedCondition::class.java,
        )
        assertEquals(HttpStatus.OK, condition.statusCode)
        val conditionId = condition.body?.id ?: error("missing condition")
        assertEquals("active", condition.body?.clinicalStatus)
        assertEquals(conditionId, http.postForEntity("/sessions/$sessionId/patients/pat_elena/conditions", RecordConditionBody("E11.9", "chart-con-00001"), RecordedCondition::class.java).body?.id)
        val unknownCode = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/conditions",
            RecordConditionBody("Z99.9", "chart-con-00002"),
            String::class.java,
        )
        assertEquals(HttpStatus.BAD_REQUEST, unknownCode.statusCode)
        val problems = http.getForObject("/sessions/$sessionId/patients/pat_elena/timeline?group=problems", PatientTimelineView::class.java)
        assertTrue(problems.events.any { it.sourceId == conditionId && it.title == "Condition · Type 2 diabetes mellitus" })
        val conditionPayload = jdbc.queryForObject(
            "SELECT payload::text FROM outbox WHERE event_type = 'condition.recorded' AND payload->>'conditionId' = ?",
            String::class.java,
            conditionId,
        )
        assertEquals(false, conditionPayload?.contains("diabetes"))
        assertEquals(true, conditionPayload?.contains("E11.9"))
        val allergy = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/allergies",
            RecordAllergyBody("Latex", "Rash", "high", "chart-all-00001"),
            RecordedAllergy::class.java,
        )
        assertEquals(HttpStatus.OK, allergy.statusCode)
        val allergyId = allergy.body?.id ?: error("missing allergy")
        val allergyPayload = jdbc.queryForObject(
            "SELECT payload::text FROM outbox WHERE event_type = 'allergy.recorded' AND payload->>'allergyId' = ?",
            String::class.java,
            allergyId,
        )
        assertEquals(false, allergyPayload?.contains("Latex"))
        val card = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/allergies",
            RecordAllergyBody("4111111111111111", "Rash", "low", "chart-all-00002"),
            String::class.java,
        )
        assertEquals(HttpStatus.BAD_REQUEST, card.statusCode)
        val nurse = http.postForEntity("/sessions", OpenSessionBody("usr_jordan"), OpenedSession::class.java)
        val nurseAllergy = http.postForEntity(
            "/sessions/${nurse.body?.sessionId}/patients/pat_elena/allergies",
            RecordAllergyBody("Iodine", "Itch", "low", "chart-all-00003"),
            RecordedAllergy::class.java,
        )
        assertEquals(HttpStatus.OK, nurseAllergy.statusCode)
        val refusedMedication = http.postForEntity(
            "/sessions/${nurse.body?.sessionId}/patients/pat_elena/medications",
            RecordMedicationBody("Metformin", "500 mg twice daily", "chart-med-00001"),
            String::class.java,
        )
        assertEquals(HttpStatus.FORBIDDEN, refusedMedication.statusCode)
        val medication = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/medications",
            RecordMedicationBody("Metformin", "500 mg twice daily", "chart-med-00002"),
            RecordedMedication::class.java,
        )
        assertEquals(HttpStatus.OK, medication.statusCode)
        val medicationId = medication.body?.id ?: error("missing medication")
        assertEquals("active", medication.body?.status)
        val medicines = http.getForObject("/sessions/$sessionId/patients/pat_elena/timeline?group=medications", PatientTimelineView::class.java)
        assertTrue(medicines.events.any { it.sourceId == medicationId && it.title == "Medication · Metformin" })
        val medicationPayload = jdbc.queryForObject(
            "SELECT payload::text FROM outbox WHERE event_type = 'medication.recorded' AND payload->>'medicationId' = ?",
            String::class.java,
            medicationId,
        )
        assertEquals(false, medicationPayload?.contains("Metformin"))
        val east = http.postForEntity("/sessions", OpenSessionBody("usr_lea"), OpenedSession::class.java)
        val hidden = http.postForEntity(
            "/sessions/${east.body?.sessionId}/patients/pat_elena/conditions",
            RecordConditionBody("I10", "chart-con-00003"),
            String::class.java,
        )
        assertEquals(HttpStatus.NOT_FOUND, hidden.statusCode)
    }

    @Test
    fun aTimedReadingIsStoredOnTheTimeline() {
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_amira"), OpenedSession::class.java)
        val sessionId = opened.body?.sessionId ?: error("missing session")
        val body = RecordObservationBody("8867-4", BigDecimal("72"), "device-read-0001", "2026-10-08T09:05:00.000Z")
        val created = http.postForEntity("/sessions/$sessionId/patients/pat_elena/observations", body, RecordedObservation::class.java)
        assertEquals(HttpStatus.OK, created.statusCode)
        val id = created.body?.id ?: error("missing observation")
        assertEquals("2026-10-08T09:05:00.000Z", created.body?.effectiveAt)
        assertEquals(id, http.postForEntity("/sessions/$sessionId/patients/pat_elena/observations", body, RecordedObservation::class.java).body?.id)
        val results = http.getForObject("/sessions/$sessionId/patients/pat_elena/timeline?group=results", PatientTimelineView::class.java)
        assertTrue(results.events.any { it.sourceId == id && it.at == "2026-10-08T09:05:00.000Z" && it.title == "Heart rate · 72 /min" })
        val payload = jdbc.queryForObject(
            "SELECT payload::text FROM outbox WHERE event_type = 'observation.recorded' AND payload->>'observationId' = ?",
            String::class.java,
            id,
        )
        assertEquals(false, payload?.contains("\"72\"") == true || payload?.contains(":72") == true)
        val ahead = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/observations",
            RecordObservationBody("8867-4", BigDecimal("73"), "device-read-0002", "2099-01-01T00:00:00.000Z"),
            String::class.java,
        )
        assertEquals(HttpStatus.BAD_REQUEST, ahead.statusCode)
    }

    @Test
    fun aLabOrderStaysOnTheSessionFacility() {
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_amira"), OpenedSession::class.java)
        val sessionId = opened.body?.sessionId ?: error("missing session")
        val created = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/lab-orders",
            RecordLabOrderBody("2823-3", "lab-order-0001"),
            RecordedLabOrder::class.java,
        )
        assertEquals(HttpStatus.OK, created.statusCode)
        val orderId = created.body?.id ?: error("missing order")
        assertEquals("requested", created.body?.status)
        assertEquals("Potassium", created.body?.display)
        assertEquals("2823-3", created.body?.code)
        assertEquals(orderId, http.postForEntity("/sessions/$sessionId/patients/pat_elena/lab-orders", RecordLabOrderBody("2823-3", "lab-order-0001"), RecordedLabOrder::class.java).body?.id)
        val changed = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/lab-orders",
            RecordLabOrderBody("8867-4", "lab-order-0001"),
            String::class.java,
        )
        assertEquals(HttpStatus.CONFLICT, changed.statusCode)
        val unknown = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/lab-orders",
            RecordLabOrderBody("not-a-code", "lab-order-0002"),
            String::class.java,
        )
        assertEquals(HttpStatus.BAD_REQUEST, unknown.statusCode)
        assertTrue(unknown.body?.contains("\"code\"") == true)
        val nurse = http.postForEntity("/sessions", OpenSessionBody("usr_jordan"), OpenedSession::class.java)
        val refused = http.postForEntity(
            "/sessions/${nurse.body?.sessionId}/patients/pat_elena/lab-orders",
            RecordLabOrderBody("2823-3", "lab-order-0003"),
            String::class.java,
        )
        assertEquals(HttpStatus.FORBIDDEN, refused.statusCode)
        val east = http.postForEntity("/sessions", OpenSessionBody("usr_lea"), OpenedSession::class.java)
        val hidden = http.postForEntity(
            "/sessions/${east.body?.sessionId}/patients/pat_elena/lab-orders",
            RecordLabOrderBody("2823-3", "lab-order-0004"),
            String::class.java,
        )
        assertEquals(HttpStatus.NOT_FOUND, hidden.statusCode)
        val lakeside = http.postForEntity("/sessions", OpenSessionBody("usr_evan"), OpenedSession::class.java)
        val bnp = http.postForEntity(
            "/sessions/${lakeside.body?.sessionId}/patients/pat_samir/lab-orders",
            RecordLabOrderBody("30934-4", "lab-order-0005"),
            String::class.java,
        )
        assertEquals(HttpStatus.BAD_REQUEST, bnp.statusCode)
        val payload = jdbc.queryForObject(
            "SELECT payload::text FROM outbox WHERE event_type = 'lab.ordered' AND payload->>'orderId' = ?",
            String::class.java,
            orderId,
        )
        assertEquals(false, payload?.contains("Potassium"))
        assertEquals(true, payload?.contains("2823-3"))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM lab_orders WHERE id = ? AND status = 'requested'", Int::class.java, orderId))
    }

    @Test
    fun aSpecimenIsStoredAgainstTheOrder() {
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_amira"), OpenedSession::class.java)
        val sessionId = opened.body?.sessionId ?: error("missing session")
        val created = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/lab-orders",
            RecordLabOrderBody("2823-3", "lab-spec-order1"),
            RecordedLabOrder::class.java,
        )
        val orderId = created.body?.id ?: error("missing order")
        val nurse = http.postForEntity("/sessions", OpenSessionBody("usr_jordan"), OpenedSession::class.java)
        val nurseId = nurse.body?.sessionId ?: error("missing nurse")
        val collected = http.postForEntity(
            "/sessions/$nurseId/patients/pat_elena/lab-orders/$orderId/specimen",
            CollectSpecimenBody("lab-spec-00001"),
            RecordedSpecimen::class.java,
        )
        assertEquals(HttpStatus.OK, collected.statusCode)
        val specimenId = collected.body?.id ?: error("missing specimen")
        assertEquals(orderId, collected.body?.orderId)
        assertEquals(
            specimenId,
            http.postForEntity(
                "/sessions/$nurseId/patients/pat_elena/lab-orders/$orderId/specimen",
                CollectSpecimenBody("lab-spec-00001"),
                RecordedSpecimen::class.java,
            ).body?.id,
        )
        val again = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/lab-orders/$orderId/specimen",
            CollectSpecimenBody("lab-spec-00002"),
            String::class.java,
        )
        assertEquals(HttpStatus.CONFLICT, again.statusCode)
        val east = http.postForEntity("/sessions", OpenSessionBody("usr_lea"), OpenedSession::class.java)
        val hidden = http.postForEntity(
            "/sessions/${east.body?.sessionId}/patients/pat_elena/lab-orders/$orderId/specimen",
            CollectSpecimenBody("lab-spec-00003"),
            String::class.java,
        )
        assertEquals(HttpStatus.NOT_FOUND, hidden.statusCode)
        val payload = jdbc.queryForObject(
            "SELECT payload::text FROM outbox WHERE event_type = 'lab.specimen.collected' AND payload->>'specimenId' = ?",
            String::class.java,
            specimenId,
        )
        assertEquals(false, payload?.contains("Potassium"))
        assertEquals(true, payload?.contains(orderId))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM lab_orders WHERE id = ? AND status = 'collected'", Int::class.java, orderId))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM lab_specimens WHERE id = ? AND order_id = ?", Int::class.java, specimenId, orderId))
    }

    @Test
    fun aLabResultStoresThePinnedCriticalFlag() {
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_amira"), OpenedSession::class.java)
        val sessionId = opened.body?.sessionId ?: error("missing session")
        val nurse = http.postForEntity("/sessions", OpenSessionBody("usr_jordan"), OpenedSession::class.java)
        val nurseId = nurse.body?.sessionId ?: error("missing nurse")
        val order = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/lab-orders",
            RecordLabOrderBody("2823-3", "lab-res-order01"),
            RecordedLabOrder::class.java,
        )
        val orderId = order.body?.id ?: error("missing order")
        assertEquals(HttpStatus.OK, http.postForEntity("/sessions/$nurseId/patients/pat_elena/lab-orders/$orderId/specimen", CollectSpecimenBody("lab-res-spec001"), RecordedSpecimen::class.java).statusCode)
        val observation = http.postForEntity(
            "/sessions/$nurseId/patients/pat_elena/observations",
            RecordObservationBody("2823-3", BigDecimal("6.2"), "lab-res-obs0001"),
            RecordedObservation::class.java,
        )
        assertEquals(HttpStatus.OK, observation.statusCode)
        val observationId = observation.body?.id ?: error("missing observation")
        val early = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/lab-orders",
            RecordLabOrderBody("2823-3", "lab-res-order02"),
            RecordedLabOrder::class.java,
        )
        val waiting = http.postForEntity(
            "/sessions/$nurseId/patients/pat_elena/lab-orders/${early.body?.id}/result",
            RecordLabResultBody(BigDecimal("4.4"), observationId, "lab-res-early01"),
            String::class.java,
        )
        assertEquals(HttpStatus.CONFLICT, waiting.statusCode)
        val created = http.postForEntity(
            "/sessions/$nurseId/patients/pat_elena/lab-orders/$orderId/result",
            RecordLabResultBody(BigDecimal("6.2"), observationId, "lab-res-0000001"),
            RecordedLabResult::class.java,
        )
        assertEquals(HttpStatus.OK, created.statusCode)
        val resultId = created.body?.id ?: error("missing result")
        assertEquals("critical-high", created.body?.criticalFlag)
        assertEquals("lab-critical-2026.10", created.body?.ruleVersion)
        assertEquals(resultId, http.postForEntity("/sessions/$nurseId/patients/pat_elena/lab-orders/$orderId/result", RecordLabResultBody(BigDecimal("6.2"), observationId, "lab-res-0000001"), RecordedLabResult::class.java).body?.id)
        val again = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/lab-orders/$orderId/result",
            RecordLabResultBody(BigDecimal("5.4"), observationId, "lab-res-0000002"),
            String::class.java,
        )
        assertEquals(HttpStatus.CONFLICT, again.statusCode)
        val plainOrder = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/lab-orders",
            RecordLabOrderBody("2823-3", "lab-res-order03"),
            RecordedLabOrder::class.java,
        )
        val plainId = plainOrder.body?.id ?: error("missing plain order")
        http.postForEntity("/sessions/$sessionId/patients/pat_elena/lab-orders/$plainId/specimen", CollectSpecimenBody("lab-res-spec002"), RecordedSpecimen::class.java)
        val plainObservation = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/observations",
            RecordObservationBody("2823-3", BigDecimal("5.4"), "lab-res-obs0002"),
            RecordedObservation::class.java,
        )
        val plain = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/lab-orders/$plainId/result",
            RecordLabResultBody(BigDecimal("5.4"), plainObservation.body?.id, "lab-res-0000003"),
            RecordedLabResult::class.java,
        )
        assertEquals(HttpStatus.OK, plain.statusCode)
        assertEquals("none", plain.body?.criticalFlag)
        val east = http.postForEntity("/sessions", OpenSessionBody("usr_lea"), OpenedSession::class.java)
        val hidden = http.postForEntity(
            "/sessions/${east.body?.sessionId}/patients/pat_elena/lab-orders/$orderId/result",
            RecordLabResultBody(BigDecimal("6.2"), observationId, "lab-res-0000004"),
            String::class.java,
        )
        assertEquals(HttpStatus.NOT_FOUND, hidden.statusCode)
        val payload = jdbc.queryForObject(
            "SELECT payload::text FROM outbox WHERE event_type = 'lab.resulted' AND payload->>'resultId' = ?",
            String::class.java,
            resultId,
        )
        assertEquals(false, payload?.contains("6.2"))
        assertEquals(false, payload?.contains("Potassium"))
        assertEquals(true, payload?.contains("critical-high"))
        assertEquals(
            1,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM lab_results WHERE id = ? AND critical_flag = 'critical-high' AND reference_low = 3.5 AND reference_high = 5",
                Int::class.java,
                resultId,
            ),
        )
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM lab_orders WHERE id = ? AND status = 'resulted'", Int::class.java, orderId))
    }

    @Test
    fun acknowledgingALabAlertKeepsTheCriticalFlag() {
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_amira"), OpenedSession::class.java)
        val sessionId = opened.body?.sessionId ?: error("missing session")
        val nurse = http.postForEntity("/sessions", OpenSessionBody("usr_jordan"), OpenedSession::class.java)
        val nurseId = nurse.body?.sessionId ?: error("missing nurse")
        val order = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/lab-orders",
            RecordLabOrderBody("2823-3", "lab-ack-order01"),
            RecordedLabOrder::class.java,
        )
        val orderId = order.body?.id ?: error("missing order")
        http.postForEntity("/sessions/$nurseId/patients/pat_elena/lab-orders/$orderId/specimen", CollectSpecimenBody("lab-ack-spec001"), RecordedSpecimen::class.java)
        val observation = http.postForEntity(
            "/sessions/$nurseId/patients/pat_elena/observations",
            RecordObservationBody("2823-3", BigDecimal("6.2"), "lab-ack-obs0001"),
            RecordedObservation::class.java,
        )
        val resulted = http.postForEntity(
            "/sessions/$nurseId/patients/pat_elena/lab-orders/$orderId/result",
            RecordLabResultBody(BigDecimal("6.2"), observation.body?.id, "lab-ack-res0001"),
            RecordedLabResult::class.java,
        )
        assertEquals(HttpStatus.OK, resulted.statusCode)
        assertEquals("critical-high", resulted.body?.criticalFlag)
        val alertId = resulted.body?.alertId ?: error("missing alert")
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM lab_alerts WHERE id = ? AND status = 'open' AND critical_flag = 'critical-high'", Int::class.java, alertId))
        val plainOrder = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/lab-orders",
            RecordLabOrderBody("2823-3", "lab-ack-order02"),
            RecordedLabOrder::class.java,
        )
        val plainId = plainOrder.body?.id ?: error("missing plain order")
        http.postForEntity("/sessions/$sessionId/patients/pat_elena/lab-orders/$plainId/specimen", CollectSpecimenBody("lab-ack-spec002"), RecordedSpecimen::class.java)
        val plainObservation = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/observations",
            RecordObservationBody("2823-3", BigDecimal("5.4"), "lab-ack-obs0002"),
            RecordedObservation::class.java,
        )
        val plain = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/lab-orders/$plainId/result",
            RecordLabResultBody(BigDecimal("5.4"), plainObservation.body?.id, "lab-ack-res0002"),
            RecordedLabResult::class.java,
        )
        assertEquals("none", plain.body?.criticalFlag)
        assertEquals(null, plain.body?.alertId)
        val missing = http.postForEntity(
            "/sessions/$nurseId/patients/pat_elena/lab-orders/$plainId/alert/acknowledge",
            AcknowledgeLabAlertBody("lab-ack-none001"),
            String::class.java,
        )
        assertEquals(HttpStatus.NOT_FOUND, missing.statusCode)
        val auditor = http.postForEntity("/sessions", OpenSessionBody("usr_priya"), OpenedSession::class.java)
        val refused = http.postForEntity(
            "/sessions/${auditor.body?.sessionId}/patients/pat_elena/lab-orders/$orderId/alert/acknowledge",
            AcknowledgeLabAlertBody("lab-ack-audit01"),
            String::class.java,
        )
        assertEquals(HttpStatus.FORBIDDEN, refused.statusCode)
        val created = http.postForEntity(
            "/sessions/$nurseId/patients/pat_elena/lab-orders/$orderId/alert/acknowledge",
            AcknowledgeLabAlertBody("lab-ack-0000001"),
            RecordedLabAlertAcknowledgement::class.java,
        )
        assertEquals(HttpStatus.OK, created.statusCode)
        assertEquals(alertId, created.body?.id)
        assertEquals("critical-high", created.body?.criticalFlag)
        assertEquals("acknowledged", created.body?.status)
        assertEquals(
            alertId,
            http.postForEntity(
                "/sessions/$nurseId/patients/pat_elena/lab-orders/$orderId/alert/acknowledge",
                AcknowledgeLabAlertBody("lab-ack-0000001"),
                RecordedLabAlertAcknowledgement::class.java,
            ).body?.id,
        )
        val again = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/lab-orders/$orderId/alert/acknowledge",
            AcknowledgeLabAlertBody("lab-ack-0000002"),
            String::class.java,
        )
        assertEquals(HttpStatus.CONFLICT, again.statusCode)
        val east = http.postForEntity("/sessions", OpenSessionBody("usr_lea"), OpenedSession::class.java)
        val hidden = http.postForEntity(
            "/sessions/${east.body?.sessionId}/patients/pat_elena/lab-orders/$orderId/alert/acknowledge",
            AcknowledgeLabAlertBody("lab-ack-0000003"),
            String::class.java,
        )
        assertEquals(HttpStatus.NOT_FOUND, hidden.statusCode)
        val payload = jdbc.queryForObject(
            "SELECT payload::text FROM outbox WHERE event_type = 'lab.alert' AND payload->>'alertId' = ?",
            String::class.java,
            alertId,
        )
        assertEquals(false, payload?.contains("6.2"))
        assertEquals(false, payload?.contains("Potassium"))
        assertEquals(true, payload?.contains("critical-high"))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM lab_results WHERE order_id = ? AND critical_flag = 'critical-high'", Int::class.java, orderId))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM lab_alerts WHERE id = ? AND status = 'acknowledged' AND critical_flag = 'critical-high' AND acknowledged_by = 'usr_jordan'", Int::class.java, alertId))
    }

    @Test
    fun aPrescriptionStoresThePinnedWarnings() {
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_amira"), OpenedSession::class.java)
        val sessionId = opened.body?.sessionId ?: error("missing session")
        val nurse = http.postForEntity("/sessions", OpenSessionBody("usr_jordan"), OpenedSession::class.java)
        val nurseId = nurse.body?.sessionId ?: error("missing nurse")
        val refused = http.postForEntity(
            "/sessions/$nurseId/patients/pat_elena/prescriptions",
            ProposePrescriptionBody("frm_amoxicillin", "500 mg", "rx-nurse-000001"),
            String::class.java,
        )
        assertEquals(HttpStatus.FORBIDDEN, refused.statusCode)
        val created = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/prescriptions",
            ProposePrescriptionBody("frm_amoxicillin", "500 mg", "rx-amox-0000001"),
            RecordedPrescription::class.java,
        )
        assertEquals(HttpStatus.OK, created.statusCode)
        val orderId = created.body?.id ?: error("missing order")
        assertEquals("proposed", created.body?.status)
        assertEquals("Amoxicillin", created.body?.display)
        assertEquals(1, created.body?.warnings?.size)
        assertEquals("allergy", created.body?.warnings?.first()?.kind)
        assertEquals("high", created.body?.warnings?.first()?.severity)
        assertEquals("alg_penicillin", created.body?.warnings?.first()?.ruleId)
        assertEquals(
            orderId,
            http.postForEntity(
                "/sessions/$sessionId/patients/pat_elena/prescriptions",
                ProposePrescriptionBody("frm_amoxicillin", "500 mg", "rx-amox-0000001"),
                RecordedPrescription::class.java,
            ).body?.id,
        )
        val unknown = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/prescriptions",
            ProposePrescriptionBody("frm_missing", "500 mg", "rx-amox-0000002"),
            String::class.java,
        )
        assertEquals(HttpStatus.BAD_REQUEST, unknown.statusCode)
        assertEquals(true, unknown.body?.contains("code"))
        val ibuprofen = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/prescriptions",
            ProposePrescriptionBody("frm_ibuprofen", "200 mg", "rx-ibu-0000001"),
            RecordedPrescription::class.java,
        )
        assertEquals(HttpStatus.OK, ibuprofen.statusCode)
        assertEquals(true, ibuprofen.body?.warnings?.any { it.kind == "formulary" && it.severity == "moderate" && it.ruleId == "frm_nonformulary" })
        val east = http.postForEntity("/sessions", OpenSessionBody("usr_lea"), OpenedSession::class.java)
        val hidden = http.postForEntity(
            "/sessions/${east.body?.sessionId}/patients/pat_elena/prescriptions",
            ProposePrescriptionBody("frm_amoxicillin", "500 mg", "rx-amox-0000003"),
            String::class.java,
        )
        assertEquals(HttpStatus.NOT_FOUND, hidden.statusCode)
        val payload = jdbc.queryForObject(
            "SELECT payload::text FROM outbox WHERE event_type = 'rx.prescribe' AND payload->>'orderId' = ?",
            String::class.java,
            orderId,
        )
        assertEquals(false, payload?.contains("Amoxicillin"))
        assertEquals(false, payload?.contains("500 mg"))
        assertEquals(true, payload?.contains("frm_amoxicillin"))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM rx_orders WHERE id = ? AND status = 'proposed'", Int::class.java, orderId))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM rx_warnings WHERE order_id = ? AND rule_id = 'alg_penicillin' AND status = 'open'", Int::class.java, orderId))
    }

    @Test
    fun recordingAPrescriptionMarksTheFoundationOrderActive() {
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_amira"), OpenedSession::class.java)
        val sessionId = opened.body?.sessionId ?: error("missing session")
        val nurse = http.postForEntity("/sessions", OpenSessionBody("usr_jordan"), OpenedSession::class.java)
        val nurseId = nurse.body?.sessionId ?: error("missing nurse")
        val proposed = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/prescriptions",
            ProposePrescriptionBody("frm_amoxicillin", "500 mg", "rx-rec-order001"),
            RecordedPrescription::class.java,
        )
        assertEquals(HttpStatus.OK, proposed.statusCode)
        val orderId = proposed.body?.id ?: error("missing order")
        val refused = http.postForEntity(
            "/sessions/$nurseId/patients/pat_elena/prescriptions/$orderId/record",
            RecordPrescriptionBody("med_elena_metformin", "rx-rec-nurse001"),
            String::class.java,
        )
        assertEquals(HttpStatus.FORBIDDEN, refused.statusCode)
        val mismatch = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/prescriptions/$orderId/record",
            RecordPrescriptionBody("med_elena_metformin", "rx-rec-wrong001"),
            String::class.java,
        )
        assertEquals(HttpStatus.CONFLICT, mismatch.statusCode)
        val medication = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/medications",
            RecordMedicationBody("Amoxicillin", "500 mg", "rx-rec-med00001"),
            RecordedMedication::class.java,
        )
        assertEquals(HttpStatus.OK, medication.statusCode)
        val medicationId = medication.body?.id ?: error("missing medication")
        val recorded = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/prescriptions/$orderId/record",
            RecordPrescriptionBody(medicationId, "rx-rec-0000001"),
            RecordedActivePrescription::class.java,
        )
        assertEquals(HttpStatus.OK, recorded.statusCode)
        assertEquals("active", recorded.body?.status)
        assertEquals(medicationId, recorded.body?.medicationId)
        assertEquals(
            medicationId,
            http.postForEntity(
                "/sessions/$sessionId/patients/pat_elena/prescriptions/$orderId/record",
                RecordPrescriptionBody(medicationId, "rx-rec-0000001"),
                RecordedActivePrescription::class.java,
            ).body?.medicationId,
        )
        val again = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/prescriptions/$orderId/record",
            RecordPrescriptionBody(medicationId, "rx-rec-0000002"),
            String::class.java,
        )
        assertEquals(HttpStatus.CONFLICT, again.statusCode)
        val east = http.postForEntity("/sessions", OpenSessionBody("usr_lea"), OpenedSession::class.java)
        val hidden = http.postForEntity(
            "/sessions/${east.body?.sessionId}/patients/pat_elena/prescriptions/$orderId/record",
            RecordPrescriptionBody(medicationId, "rx-rec-0000003"),
            String::class.java,
        )
        assertEquals(HttpStatus.NOT_FOUND, hidden.statusCode)
        val payload = jdbc.queryForObject(
            "SELECT payload::text FROM outbox WHERE event_type = 'rx.activate' AND payload->>'orderId' = ?",
            String::class.java,
            orderId,
        )
        assertEquals(false, payload?.contains("Amoxicillin"))
        assertEquals(false, payload?.contains("500 mg"))
        assertEquals(true, payload?.contains(medicationId))
        assertEquals(true, payload?.contains("frm_amoxicillin"))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM rx_orders WHERE id = ? AND status = 'active' AND medication_id = ?", Int::class.java, orderId, medicationId))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM rx_warnings WHERE order_id = ? AND status = 'open'", Int::class.java, orderId))
    }

    @Test
    fun aDispenseIsStoredAgainstTheFoundationOrder() {
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_amira"), OpenedSession::class.java)
        val sessionId = opened.body?.sessionId ?: error("missing session")
        val nurse = http.postForEntity("/sessions", OpenSessionBody("usr_jordan"), OpenedSession::class.java)
        val nurseId = nurse.body?.sessionId ?: error("missing nurse")
        val waiting = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/prescriptions",
            ProposePrescriptionBody("frm_warfarin", "5 mg", "rx-dsp-order001"),
            RecordedPrescription::class.java,
        )
        val waitingId = waiting.body?.id ?: error("missing waiting order")
        val early = http.postForEntity(
            "/sessions/$nurseId/patients/pat_elena/prescriptions/$waitingId/dispenses",
            DispensePrescriptionBody(5, "rx-dsp-early001"),
            String::class.java,
        )
        assertEquals(HttpStatus.CONFLICT, early.statusCode)
        val medication = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/medications",
            RecordMedicationBody("Warfarin", "5 mg", "rx-dsp-med00001"),
            RecordedMedication::class.java,
        )
        val medicationId = medication.body?.id ?: error("missing medication")
        assertEquals(
            HttpStatus.OK,
            http.postForEntity(
                "/sessions/$sessionId/patients/pat_elena/prescriptions/$waitingId/record",
                RecordPrescriptionBody(medicationId, "rx-dsp-rec00001"),
                RecordedActivePrescription::class.java,
            ).statusCode,
        )
        val auditor = http.postForEntity("/sessions", OpenSessionBody("usr_priya"), OpenedSession::class.java)
        val refused = http.postForEntity(
            "/sessions/${auditor.body?.sessionId}/patients/pat_elena/prescriptions/$waitingId/dispenses",
            DispensePrescriptionBody(5, "rx-dsp-audit001"),
            String::class.java,
        )
        assertEquals(HttpStatus.FORBIDDEN, refused.statusCode)
        val low = http.postForEntity(
            "/sessions/$nurseId/patients/pat_elena/prescriptions/$waitingId/dispenses",
            DispensePrescriptionBody(0, "rx-dsp-low00001"),
            String::class.java,
        )
        assertEquals(HttpStatus.BAD_REQUEST, low.statusCode)
        assertEquals(true, low.body?.contains("range"))
        val created = http.postForEntity(
            "/sessions/$nurseId/patients/pat_elena/prescriptions/$waitingId/dispenses",
            DispensePrescriptionBody(5, "rx-dsp-0000001"),
            RecordedDispense::class.java,
        )
        assertEquals(HttpStatus.OK, created.statusCode)
        val dispenseId = created.body?.id ?: error("missing dispense")
        assertEquals(5, created.body?.quantity)
        assertEquals(
            dispenseId,
            http.postForEntity(
                "/sessions/$nurseId/patients/pat_elena/prescriptions/$waitingId/dispenses",
                DispensePrescriptionBody(5, "rx-dsp-0000001"),
                RecordedDispense::class.java,
            ).body?.id,
        )
        val second = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/prescriptions/$waitingId/dispenses",
            DispensePrescriptionBody(2, "rx-dsp-0000002"),
            RecordedDispense::class.java,
        )
        assertEquals(HttpStatus.OK, second.statusCode)
        assertEquals(2, second.body?.quantity)
        val east = http.postForEntity("/sessions", OpenSessionBody("usr_lea"), OpenedSession::class.java)
        val hidden = http.postForEntity(
            "/sessions/${east.body?.sessionId}/patients/pat_elena/prescriptions/$waitingId/dispenses",
            DispensePrescriptionBody(1, "rx-dsp-0000003"),
            String::class.java,
        )
        assertEquals(HttpStatus.NOT_FOUND, hidden.statusCode)
        val payload = jdbc.queryForObject(
            "SELECT payload::text FROM outbox WHERE event_type = 'rx.dispense' AND payload->>'dispenseId' = ?",
            String::class.java,
            dispenseId,
        )
        assertEquals(false, payload?.contains("Warfarin"))
        assertEquals(false, payload?.contains("5 mg"))
        assertEquals(true, payload?.contains(dispenseId))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM rx_dispenses WHERE id = ? AND quantity = 5", Int::class.java, dispenseId))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM rx_orders WHERE id = ? AND status = 'dispensed'", Int::class.java, waitingId))
        assertEquals(7, jdbc.queryForObject("SELECT COALESCE(SUM(quantity), 0) FROM rx_dispenses WHERE order_id = ?", Int::class.java, waitingId))
    }

    @Test
    fun anAdministrationIsStoredAgainstTheFoundationOrder() {
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_amira"), OpenedSession::class.java)
        val sessionId = opened.body?.sessionId ?: error("missing session")
        val nurse = http.postForEntity("/sessions", OpenSessionBody("usr_jordan"), OpenedSession::class.java)
        val nurseId = nurse.body?.sessionId ?: error("missing nurse")
        val waiting = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/prescriptions",
            ProposePrescriptionBody("frm_warfarin", "5 mg", "rx-adm-order001"),
            RecordedPrescription::class.java,
        )
        val orderId = waiting.body?.id ?: error("missing order")
        val early = http.postForEntity(
            "/sessions/$nurseId/patients/pat_elena/prescriptions/$orderId/administrations",
            AdministerPrescriptionBody("rx-adm-early001"),
            String::class.java,
        )
        assertEquals(HttpStatus.CONFLICT, early.statusCode)
        val medication = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/medications",
            RecordMedicationBody("Warfarin", "5 mg", "rx-adm-med00001"),
            RecordedMedication::class.java,
        )
        val medicationId = medication.body?.id ?: error("missing medication")
        assertEquals(
            HttpStatus.OK,
            http.postForEntity(
                "/sessions/$sessionId/patients/pat_elena/prescriptions/$orderId/record",
                RecordPrescriptionBody(medicationId, "rx-adm-rec00001"),
                RecordedActivePrescription::class.java,
            ).statusCode,
        )
        val auditor = http.postForEntity("/sessions", OpenSessionBody("usr_priya"), OpenedSession::class.java)
        val refused = http.postForEntity(
            "/sessions/${auditor.body?.sessionId}/patients/pat_elena/prescriptions/$orderId/administrations",
            AdministerPrescriptionBody("rx-adm-audit001"),
            String::class.java,
        )
        assertEquals(HttpStatus.FORBIDDEN, refused.statusCode)
        val created = http.postForEntity(
            "/sessions/$nurseId/patients/pat_elena/prescriptions/$orderId/administrations",
            AdministerPrescriptionBody("rx-adm-0000001"),
            RecordedAdministration::class.java,
        )
        assertEquals(HttpStatus.OK, created.statusCode)
        val administrationId = created.body?.id ?: error("missing administration")
        assertEquals(
            administrationId,
            http.postForEntity(
                "/sessions/$nurseId/patients/pat_elena/prescriptions/$orderId/administrations",
                AdministerPrescriptionBody("rx-adm-0000001"),
                RecordedAdministration::class.java,
            ).body?.id,
        )
        val second = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/prescriptions/$orderId/administrations",
            AdministerPrescriptionBody("rx-adm-0000002"),
            RecordedAdministration::class.java,
        )
        assertEquals(HttpStatus.OK, second.statusCode)
        val east = http.postForEntity("/sessions", OpenSessionBody("usr_lea"), OpenedSession::class.java)
        val hidden = http.postForEntity(
            "/sessions/${east.body?.sessionId}/patients/pat_elena/prescriptions/$orderId/administrations",
            AdministerPrescriptionBody("rx-adm-0000003"),
            String::class.java,
        )
        assertEquals(HttpStatus.NOT_FOUND, hidden.statusCode)
        val payload = jdbc.queryForObject(
            "SELECT payload::text FROM outbox WHERE event_type = 'rx.administer' AND payload->>'administrationId' = ?",
            String::class.java,
            administrationId,
        )
        assertEquals(false, payload?.contains("Warfarin"))
        assertEquals(false, payload?.contains("5 mg"))
        assertEquals(true, payload?.contains(administrationId))
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM rx_administrations WHERE order_id = ?", Int::class.java, orderId))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM rx_orders WHERE id = ? AND status = 'active'", Int::class.java, orderId))
    }

    @Test
    fun acknowledgingAWarningKeepsItsSeverity() {
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_amira"), OpenedSession::class.java)
        val sessionId = opened.body?.sessionId ?: error("missing session")
        val nurse = http.postForEntity("/sessions", OpenSessionBody("usr_jordan"), OpenedSession::class.java)
        val nurseId = nurse.body?.sessionId ?: error("missing nurse")
        val proposed = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/prescriptions",
            ProposePrescriptionBody("frm_amoxicillin", "500 mg", "rx-ack-order001"),
            RecordedPrescription::class.java,
        )
        assertEquals(HttpStatus.OK, proposed.statusCode)
        val orderId = proposed.body?.id ?: error("missing order")
        val warningId = proposed.body?.warnings?.first()?.id ?: error("missing warning")
        assertEquals("high", proposed.body?.warnings?.first()?.severity)
        val auditor = http.postForEntity("/sessions", OpenSessionBody("usr_priya"), OpenedSession::class.java)
        val refused = http.postForEntity(
            "/sessions/${auditor.body?.sessionId}/patients/pat_elena/prescriptions/$orderId/warnings/$warningId/acknowledge",
            AcknowledgeWarningBody("rx-ack-audit001"),
            String::class.java,
        )
        assertEquals(HttpStatus.FORBIDDEN, refused.statusCode)
        val created = http.postForEntity(
            "/sessions/$nurseId/patients/pat_elena/prescriptions/$orderId/warnings/$warningId/acknowledge",
            AcknowledgeWarningBody("rx-ack-0000001"),
            RecordedWarningAcknowledgement::class.java,
        )
        assertEquals(HttpStatus.OK, created.statusCode)
        assertEquals("acknowledged", created.body?.status)
        assertEquals("high", created.body?.severity)
        assertEquals(
            "high",
            http.postForEntity(
                "/sessions/$nurseId/patients/pat_elena/prescriptions/$orderId/warnings/$warningId/acknowledge",
                AcknowledgeWarningBody("rx-ack-0000001"),
                RecordedWarningAcknowledgement::class.java,
            ).body?.severity,
        )
        val again = http.postForEntity(
            "/sessions/$sessionId/patients/pat_elena/prescriptions/$orderId/warnings/$warningId/acknowledge",
            AcknowledgeWarningBody("rx-ack-0000002"),
            String::class.java,
        )
        assertEquals(HttpStatus.CONFLICT, again.statusCode)
        val east = http.postForEntity("/sessions", OpenSessionBody("usr_lea"), OpenedSession::class.java)
        val hidden = http.postForEntity(
            "/sessions/${east.body?.sessionId}/patients/pat_elena/prescriptions/$orderId/warnings/$warningId/acknowledge",
            AcknowledgeWarningBody("rx-ack-0000003"),
            String::class.java,
        )
        assertEquals(HttpStatus.NOT_FOUND, hidden.statusCode)
        val payload = jdbc.queryForObject(
            "SELECT payload::text FROM outbox WHERE event_type = 'rx.warning' AND payload->>'warningId' = ?",
            String::class.java,
            warningId,
        )
        assertEquals(false, payload?.contains("Amoxicillin"))
        assertEquals(false, payload?.contains("Penicillin"))
        assertEquals(false, payload?.contains("Allergy"))
        assertEquals(true, payload?.contains("high"))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM rx_warnings WHERE id = ? AND status = 'acknowledged' AND severity = 'high' AND acknowledged_by = 'usr_jordan'", Int::class.java, warningId))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM rx_orders WHERE id = ? AND status = 'proposed'", Int::class.java, orderId))
    }

    @Test
    fun tenancyIsolatesDemoOrganizations() {
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_gh_admin"), OpenedSession::class.java)
        assertEquals(HttpStatus.OK, opened.statusCode)
        val sessionId = opened.body?.sessionId ?: error("missing session")
        val headers = HttpHeaders()
        headers.set("X-Organization-Id", "org_demo_eu")
        val denied = http.exchange("/sessions/$sessionId/tenancy", HttpMethod.GET, HttpEntity<Void>(headers), String::class.java)
        assertEquals(HttpStatus.FORBIDDEN, denied.statusCode)
        assertEquals(false, denied.body?.contains("Northbridge"))
        assertEquals(false, denied.body?.contains("org_demo_eu"))
        val view = http.getForEntity("/sessions/$sessionId/tenancy", String::class.java)
        assertEquals(HttpStatus.OK, view.statusCode)
        assertEquals(true, view.body?.contains("DEMO_GH"))
        assertEquals(true, view.body?.contains("Accra Central Medical Centre"))
        assertEquals(false, view.body?.contains("DEMO_EU"))
        assertEquals(false, view.body?.contains("Northbridge"))
        val guessed = http.getForEntity("/sessions/$sessionId/tenancy/organizations/org_demo_eu", String::class.java)
        assertEquals(HttpStatus.NOT_FOUND, guessed.statusCode)
        assertEquals(false, guessed.body?.contains("Riverside"))
        assertEquals(false, guessed.body?.contains("org_demo_eu"))
        val nurse = http.postForEntity("/sessions", OpenSessionBody("usr_gh_nurse"), OpenedSession::class.java)
        val nurseId = nurse.body?.sessionId ?: error("missing nurse session")
        val current = http.getForObject("/sessions/$nurseId/tenancy", TenancyView::class.java)
        val moved = http.postForEntity(
            "/sessions/$nurseId/tenancy/facility",
            SwitchFacilityBody("fac_gh_east_legon", current.version),
            TenancyView::class.java,
        )
        assertEquals(HttpStatus.OK, moved.statusCode)
        assertEquals("fac_gh_east_legon", moved.body?.facilityId)
        val stale = http.postForEntity(
            "/sessions/$nurseId/tenancy/facility",
            SwitchFacilityBody("fac_eu_riverside", current.version),
            String::class.java,
        )
        assertEquals(HttpStatus.CONFLICT, stale.statusCode)
        assertEquals(false, stale.body?.contains("Riverside"))
        assertEquals(false, stale.body?.contains("fac_eu_riverside"))
    }

    @Test
    fun unknownUserIsRefused() {
        val response = http.postForEntity("/sessions", OpenSessionBody("usr_missing"), String::class.java)
        assertEquals(HttpStatus.NOT_FOUND, response.statusCode)
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM sessions", Int::class.java))
    }
}

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = ["curasphere.env=production"],
)
class FoundationProductionDirectoryTest {
    @Autowired
    lateinit var http: TestRestTemplate

    @Test
    fun directoryAndSignInAreDisabled() {
        assertEquals(HttpStatus.FORBIDDEN, http.getForEntity("/directory", String::class.java).statusCode)
        val opened = http.postForEntity("/sessions", OpenSessionBody("usr_amira"), String::class.java)
        assertEquals(HttpStatus.FORBIDDEN, opened.statusCode)
    }
}
