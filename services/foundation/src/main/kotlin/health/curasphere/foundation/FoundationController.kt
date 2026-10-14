package health.curasphere.foundation

import jakarta.servlet.RequestDispatcher
import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.web.servlet.error.ErrorController
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.servlet.config.annotation.ContentNegotiationConfigurer
import org.springframework.web.servlet.config.annotation.CorsRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.RestControllerAdvice

data class OpenSessionBody(val userId: String?)

data class ApiError(val error: String)

@Configuration
class FoundationWeb : WebMvcConfigurer {
    override fun configureContentNegotiation(configurer: ContentNegotiationConfigurer) {
        configurer.ignoreAcceptHeader(true).defaultContentType(MediaType.APPLICATION_JSON)
    }

    override fun addCorsMappings(registry: CorsRegistry) {
        registry.addMapping("/**").allowedMethods("GET", "POST").allowedOrigins("*")
    }
}

@RestController
class FoundationController(
    private val foundation: FoundationService,
    private val tenancy: TenancyService,
) {
    @GetMapping("/", "/health")
    fun health() = foundation.health()

    @GetMapping("/directory")
    fun directory() = foundation.directory()

    @PostMapping("/sessions")
    fun open(@RequestBody body: OpenSessionBody) = foundation.openSession(body.userId ?: "")

    @GetMapping("/sessions/{id}/tenancy")
    fun tenancy(
        @PathVariable id: String,
        @RequestHeader(name = "X-Organization-Id", required = false) claimedOrganizationId: String?,
    ) = tenancy.read(id, claimedOrganizationId)

    @GetMapping("/sessions/{id}/tenancy/organizations/{organizationId}")
    fun tenancyOrganization(@PathVariable id: String, @PathVariable organizationId: String) =
        tenancy.readOrganization(id, organizationId)

    @PostMapping("/sessions/{id}/tenancy/facility")
    fun tenancyFacility(@PathVariable id: String, @RequestBody body: SwitchFacilityBody) = tenancy.switchFacility(id, body)

    @GetMapping("/sessions/{id}/encounters")
    fun encounters(@PathVariable id: String) = foundation.listOpenEncounters(id)

    @PostMapping("/sessions/{id}/encounters")
    fun openEncounter(@PathVariable id: String, @RequestBody body: OpenEncounterBody) = foundation.openEncounter(id, body)

    @PostMapping("/sessions/{id}/encounters/{encounterId}/finish")
    fun finishEncounter(
        @PathVariable id: String,
        @PathVariable encounterId: String,
        @RequestBody body: FinishEncounterBody,
    ) = foundation.finishEncounter(id, encounterId, body)

    @GetMapping("/sessions/{id}/catalog")
    fun catalog(@PathVariable id: String) = foundation.listCatalog(id)

    @GetMapping("/sessions/{id}/condition-catalog")
    fun conditionCatalog(@PathVariable id: String) = foundation.listConditionCatalog(id)

    @PostMapping("/sessions/{id}/patients/{patientId}/conditions")
    fun recordCondition(
        @PathVariable id: String,
        @PathVariable patientId: String,
        @RequestBody body: RecordConditionBody,
    ) = foundation.recordCondition(id, patientId, body)

    @PostMapping("/sessions/{id}/patients/{patientId}/lab-orders")
    fun recordLabOrder(
        @PathVariable id: String,
        @PathVariable patientId: String,
        @RequestBody body: RecordLabOrderBody,
    ) = foundation.recordLabOrder(id, patientId, body)

    @PostMapping("/sessions/{id}/patients/{patientId}/lab-orders/{orderId}/specimen")
    fun collectSpecimen(
        @PathVariable id: String,
        @PathVariable patientId: String,
        @PathVariable orderId: String,
        @RequestBody body: CollectSpecimenBody,
    ) = foundation.collectSpecimen(id, patientId, orderId, body)

    @PostMapping("/sessions/{id}/patients/{patientId}/lab-orders/{orderId}/alert/acknowledge")
    fun acknowledgeLabAlert(
        @PathVariable id: String,
        @PathVariable patientId: String,
        @PathVariable orderId: String,
        @RequestBody body: AcknowledgeLabAlertBody,
    ) = foundation.acknowledgeLabAlert(id, patientId, orderId, body)

    @PostMapping("/sessions/{id}/patients/{patientId}/lab-orders/{orderId}/result")
    fun recordLabResult(
        @PathVariable id: String,
        @PathVariable patientId: String,
        @PathVariable orderId: String,
        @RequestBody body: RecordLabResultBody,
    ) = foundation.recordLabResult(id, patientId, orderId, body)

    @PostMapping("/sessions/{id}/patients/{patientId}/prescriptions/{orderId}/warnings/{warningId}/acknowledge")
    fun acknowledgeWarning(
        @PathVariable id: String,
        @PathVariable patientId: String,
        @PathVariable orderId: String,
        @PathVariable warningId: String,
        @RequestBody body: AcknowledgeWarningBody,
    ) = foundation.acknowledgeWarning(id, patientId, orderId, warningId, body)

    @PostMapping("/sessions/{id}/patients/{patientId}/prescriptions/{orderId}/administrations")
    fun administerPrescription(
        @PathVariable id: String,
        @PathVariable patientId: String,
        @PathVariable orderId: String,
        @RequestBody body: AdministerPrescriptionBody,
    ) = foundation.administerPrescription(id, patientId, orderId, body)

    @PostMapping("/sessions/{id}/patients/{patientId}/prescriptions/{orderId}/dispenses")
    fun dispensePrescription(
        @PathVariable id: String,
        @PathVariable patientId: String,
        @PathVariable orderId: String,
        @RequestBody body: DispensePrescriptionBody,
    ) = foundation.dispensePrescription(id, patientId, orderId, body)

    @PostMapping("/sessions/{id}/patients/{patientId}/prescriptions/{orderId}/record")
    fun recordPrescription(
        @PathVariable id: String,
        @PathVariable patientId: String,
        @PathVariable orderId: String,
        @RequestBody body: RecordPrescriptionBody,
    ) = foundation.recordPrescription(id, patientId, orderId, body)

    @PostMapping("/sessions/{id}/patients/{patientId}/prescriptions")
    fun proposePrescription(
        @PathVariable id: String,
        @PathVariable patientId: String,
        @RequestBody body: ProposePrescriptionBody,
    ) = foundation.proposePrescription(id, patientId, body)

    @PostMapping("/sessions/{id}/patients/{patientId}/allergies")
    fun recordAllergy(
        @PathVariable id: String,
        @PathVariable patientId: String,
        @RequestBody body: RecordAllergyBody,
    ) = foundation.recordAllergy(id, patientId, body)

    @PostMapping("/sessions/{id}/patients/{patientId}/medications")
    fun recordMedication(
        @PathVariable id: String,
        @PathVariable patientId: String,
        @RequestBody body: RecordMedicationBody,
    ) = foundation.recordMedication(id, patientId, body)

    @PostMapping("/sessions/{id}/appointments")
    fun bookAppointment(@PathVariable id: String, @RequestBody body: BookAppointmentBody) = foundation.bookAppointment(id, body)

    @GetMapping("/sessions/{id}/appointments")
    fun appointments(@PathVariable id: String, @RequestParam(name = "day", defaultValue = "") day: String) =
        foundation.listAppointments(id, day)

    @GetMapping("/sessions/{id}/patients/{patientId}/core")
    fun chartCore(@PathVariable id: String, @PathVariable patientId: String) = foundation.chartCore(id, patientId)

    @GetMapping("/sessions/{id}/patients/{patientId}/timeline")
    fun timeline(
        @PathVariable id: String,
        @PathVariable patientId: String,
        @RequestParam(name = "group", defaultValue = "all") group: String,
    ) = foundation.patientTimeline(id, patientId, group)

    @GetMapping("/sessions/{id}/patients/{patientId}/observations")
    fun observations(@PathVariable id: String, @PathVariable patientId: String) =
        foundation.listObservations(id, patientId)

    @PostMapping("/sessions/{id}/patients/{patientId}/observations")
    fun recordObservation(
        @PathVariable id: String,
        @PathVariable patientId: String,
        @RequestBody body: RecordObservationBody,
    ) = foundation.recordObservation(id, patientId, body)

    @GetMapping("/sessions/{id}/patients")
    fun patients(@PathVariable id: String, @RequestParam(name = "q", defaultValue = "") query: String) =
        foundation.listPatients(id, query)

    @PostMapping("/sessions/{id}/patients")
    fun register(@PathVariable id: String, @RequestBody body: RegisterPatientBody) =
        foundation.registerPatient(id, body)

    @GetMapping("/sessions/{id}")
    fun read(@PathVariable id: String): ResponseEntity<WorkforceSession> {
        val session = foundation.readSession(id) ?: return ResponseEntity.notFound().build()
        return ResponseEntity.ok(session)
    }

    @PostMapping("/sessions/{id}/end")
    fun end(@PathVariable id: String): ResponseEntity<Void> {
        foundation.endSession(id)
        return ResponseEntity.noContent().build()
    }
}

@RestController
class FoundationFallback : ErrorController {
    @RequestMapping("/error")
    fun error(request: HttpServletRequest): ResponseEntity<ApiError> {
        val status = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE) as? Int ?: HttpStatus.NOT_FOUND.value()
        val code = if (status == HttpStatus.NOT_FOUND.value()) "notfound" else "invalid"
        return ResponseEntity.status(status).contentType(MediaType.APPLICATION_JSON).body(ApiError(code))
    }
}

@RestControllerAdvice
class FoundationErrors {
    @ExceptionHandler(DirectoryDisabledException::class)
    fun disabled() = ResponseEntity.status(HttpStatus.FORBIDDEN).body(ApiError("disabled"))

    @ExceptionHandler(UnknownDirectoryUserException::class)
    fun unknown() = ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiError("signin"))

    @ExceptionHandler(InvalidDirectoryUserException::class)
    fun invalid() = ResponseEntity.badRequest().body(ApiError("invalid"))

    @ExceptionHandler(ChartForbiddenException::class)
    fun chartClosed() = ResponseEntity.status(HttpStatus.FORBIDDEN).body(ApiError("forbidden"))

    @ExceptionHandler(DuplicateSubmissionException::class)
    fun duplicate() = ResponseEntity.status(HttpStatus.CONFLICT).body(ApiError("duplicate"))

    @ExceptionHandler(ChartNotFoundException::class)
    fun missing() = ResponseEntity.status(HttpStatus.NOT_FOUND).body(ApiError("notfound"))

    @ExceptionHandler(EncounterOpenException::class)
    fun alreadyOpen() = ResponseEntity.status(HttpStatus.CONFLICT).body(ApiError("open"))

    @ExceptionHandler(EncounterConflictException::class)
    fun stale() = ResponseEntity.status(HttpStatus.CONFLICT).body(ApiError("conflict"))

    @ExceptionHandler(ObservationCodeException::class)
    fun unknownCode() = ResponseEntity.badRequest().body(ApiError("code"))

    @ExceptionHandler(ObservationRangeException::class)
    fun outsideRange() = ResponseEntity.badRequest().body(ApiError("range"))
}
