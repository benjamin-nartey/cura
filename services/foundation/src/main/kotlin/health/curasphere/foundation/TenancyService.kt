package health.curasphere.foundation

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

data class TenancyFacility(val id: String, val name: String, val role: String)

data class TenancyOrganization(val id: String, val name: String)

data class TenancyPrincipal(val id: String, val name: String, val scope: String)

data class TenancyView(
    val organizationId: String,
    val organizationName: String,
    val facilityId: String?,
    val facilityName: String?,
    val version: Int,
    val facilities: List<TenancyFacility>,
    val organizations: List<TenancyOrganization>,
    val principals: List<TenancyPrincipal>,
)

data class SwitchFacilityBody(val facilityId: String?, val version: Int?)

@Service
class TenancyService(private val jdbc: JdbcTemplate) {
    private val sessionIdPattern = Regex("^ses_[0-9a-fA-F-]{36}$")

    @Transactional
    fun read(sessionId: String, claimedOrganizationId: String?): TenancyView {
        assertAvailable()
        val actor = requireActor(sessionId)
        bind(actor)
        val active = activeOrganization(actor.sessionId)
        if (!claimedOrganizationId.isNullOrBlank() && claimedOrganizationId != active) {
            audit(actor, "tenancy.header", null, "denied")
            throw ChartForbiddenException()
        }
        return view(actor, active)
    }

    @Transactional
    fun readOrganization(sessionId: String, organizationId: String): TenancyOrganization {
        assertAvailable()
        if (organizationId.isBlank()) throw InvalidDirectoryUserException()
        val actor = requireActor(sessionId)
        bind(actor)
        val allowed = view(actor, activeOrganization(actor.sessionId)).organizations.any { it.id == organizationId }
        if (!allowed) {
            audit(actor, "tenancy.read", null, "not_found")
            throw ChartNotFoundException()
        }
        audit(actor, "tenancy.read", organizationId, "success")
        return TenancyOrganization(organizationId, organizationName(organizationId))
    }

    @Transactional
    fun switchFacility(sessionId: String, body: SwitchFacilityBody): TenancyView {
        assertAvailable()
        val facilityId = body.facilityId?.trim().orEmpty()
        if (facilityId.isEmpty()) throw InvalidDirectoryUserException()
        val actor = requireActor(sessionId)
        bind(actor)
        val current = view(actor, activeOrganization(actor.sessionId))
        val expected = body.version ?: -1
        if (current.version != expected) {
            audit(actor, "tenancy.switch", null, "conflict")
            throw EncounterConflictException()
        }
        if (current.facilities.none { it.id == facilityId }) {
            audit(actor, "tenancy.switch", null, "not_found")
            throw ChartNotFoundException()
        }
        if (current.facilityId != facilityId) {
            val updated = jdbc.update(
                """
                UPDATE sessions SET active_facility_id = ?, context_version = context_version + 1
                WHERE id = ? AND context_version = ?
                """.trimIndent(),
                facilityId,
                sessionId,
                expected,
            )
            if (updated != 1) {
                audit(actor, "tenancy.switch", null, "conflict")
                throw EncounterConflictException()
            }
            audit(actor, "tenancy.switch", facilityId, "success")
        }
        return view(actor, activeOrganization(actor.sessionId))
    }

    private fun assertAvailable() {
        val down = jdbc.query(
            "SELECT dependency FROM tenancy_controls WHERE id = 1",
            { rs, _ -> rs.getString("dependency") },
        ).firstOrNull()
        if (down == "unavailable") throw ChartForbiddenException()
    }

    private data class Actor(val sessionId: String, val userId: String, val organizationId: String, val facilityId: String?)

    private fun requireActor(sessionId: String): Actor {
        if (!sessionIdPattern.matches(sessionId)) throw InvalidDirectoryUserException()
        return jdbc.query(
            """
            SELECT u.id, u.organization_id, u.facility_id
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.id = ? AND s.ended_at IS NULL AND s.created_at > now() - interval '12 hours'
            """.trimIndent(),
            { rs, _ ->
                Actor(sessionId, rs.getString("id"), rs.getString("organization_id"), rs.getString("facility_id"))
            },
            sessionId,
        ).firstOrNull() ?: throw ChartNotFoundException()
    }

    private fun bind(actor: Actor) {
        jdbc.update(
            """
            UPDATE sessions
            SET active_organization_id = ?, active_facility_id = ?, context_version = 1
            WHERE id = ? AND active_organization_id IS NULL
            """.trimIndent(),
            actor.organizationId,
            actor.facilityId,
            actor.sessionId,
        )
    }

    private fun activeOrganization(sessionId: String): String {
        return jdbc.query(
            "SELECT active_organization_id FROM sessions WHERE id = ?",
            { rs, _ -> rs.getString("active_organization_id") },
            sessionId,
        ).firstOrNull() ?: throw ChartNotFoundException()
    }

    private fun organizationName(organizationId: String): String {
        return jdbc.query(
            "SELECT name FROM organizations WHERE id = ? AND status = 'active'",
            { rs, _ -> rs.getString("name") },
            organizationId,
        ).firstOrNull() ?: throw ChartNotFoundException()
    }

    private fun view(actor: Actor, organizationId: String): TenancyView {
        val org = jdbc.query(
            "SELECT id, name, status FROM organizations WHERE id = ?",
            { rs, _ -> Triple(rs.getString("id"), rs.getString("name"), rs.getString("status")) },
            organizationId,
        ).firstOrNull() ?: throw ChartNotFoundException()
        if (org.third != "active") throw ChartForbiddenException()
        val member = jdbc.query(
            "SELECT status FROM organization_memberships WHERE organization_id = ? AND user_id = ?",
            { rs, _ -> rs.getString("status") },
            organizationId,
            actor.userId,
        ).firstOrNull()
        if (member != "active") throw ChartNotFoundException()
        val facilities = jdbc.query(
            """
            SELECT f.id, f.name, m.role
            FROM facility_memberships m
            JOIN facilities f ON f.id = m.facility_id
            WHERE m.user_id = ? AND m.organization_id = ? AND m.status = 'active' AND f.status = 'active'
            ORDER BY f.name
            """.trimIndent(),
            { rs, _ -> TenancyFacility(rs.getString("id"), rs.getString("name"), rs.getString("role")) },
            actor.userId,
            organizationId,
        )
        val organizations = jdbc.query(
            """
            SELECT o.id, o.name
            FROM organization_memberships m
            JOIN organizations o ON o.id = m.organization_id
            WHERE m.user_id = ? AND m.status = 'active' AND o.status = 'active'
            ORDER BY o.name
            """.trimIndent(),
            { rs, _ -> TenancyOrganization(rs.getString("id"), rs.getString("name")) },
            actor.userId,
        )
        val principals = jdbc.query(
            """
            SELECT id, name, scope FROM service_principals
            WHERE organization_id = ? AND status = 'active'
            ORDER BY name
            """.trimIndent(),
            { rs, _ -> TenancyPrincipal(rs.getString("id"), rs.getString("name"), rs.getString("scope")) },
            organizationId,
        )
        val activeFacility = jdbc.query(
            "SELECT active_facility_id, context_version FROM sessions WHERE id = ?",
            { rs, _ -> rs.getString("active_facility_id") to rs.getInt("context_version") },
            actor.sessionId,
        ).first()
        val facility = facilities.firstOrNull { it.id == activeFacility.first }
        return TenancyView(
            organizationId = org.first,
            organizationName = org.second,
            facilityId = facility?.id,
            facilityName = facility?.name,
            version = activeFacility.second,
            facilities = facilities,
            organizations = organizations,
            principals = principals,
        )
    }

    private fun audit(actor: Actor, action: String, resourceId: String?, outcome: String) {
        jdbc.update(
            """
            INSERT INTO audit_events
              (id, organization_id, actor_id, action, resource_type, resource_id, outcome, created_at)
            VALUES (?, ?, ?, ?, 'tenancy', ?, ?, ?)
            """.trimIndent(),
            "aud_${UUID.randomUUID()}",
            actor.organizationId,
            actor.userId,
            action,
            resourceId,
            outcome,
            OffsetDateTime.now(ZoneOffset.UTC),
        )
    }
}
