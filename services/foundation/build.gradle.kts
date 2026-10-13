plugins {
    id("org.springframework.boot") version "3.4.5"
    id("io.spring.dependency-management") version "1.1.7"
    kotlin("jvm") version "2.1.20"
    kotlin("plugin.spring") version "2.1.20"
}

group = "health.curasphere"
version = "0.1.0"

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-jdbc")
    implementation("org.flywaydb:flyway-core")
    implementation("org.flywaydb:flyway-database-postgresql")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    runtimeOnly("org.postgresql:postgresql")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
}

kotlin {
    compilerOptions {
        freeCompilerArgs.addAll("-Xjsr305=strict")
    }
}

fun localDatabaseUser() = System.getenv("CURASPHERE_DATABASE_USER") ?: "curasphere"

fun localDatabasePassword() = System.getenv("CURASPHERE_DATABASE_PASSWORD")

tasks.withType<org.springframework.boot.gradle.tasks.run.BootRun> {
    // Windows defines USERNAME, and Spring binds that onto spring.datasource.username.
    systemProperty("spring.datasource.username", localDatabaseUser())
    localDatabasePassword()?.let { systemProperty("spring.datasource.password", it) }
}

tasks.withType<Test> {
    useJUnitPlatform()
    systemProperty("spring.datasource.username", localDatabaseUser())
    localDatabasePassword()?.let { systemProperty("spring.datasource.password", it) }
}
