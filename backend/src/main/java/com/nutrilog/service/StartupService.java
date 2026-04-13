package com.nutrilog.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.io.File;
import java.nio.file.Path;

@Component
public class StartupService implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(StartupService.class);
    private static final long PURGE_THRESHOLD_BYTES = 100L * 1024 * 1024; // 100 MB

    private final JdbcTemplate jdbcTemplate;

    @Value("${spring.datasource.url}")
    private String datasourceUrl;

    public StartupService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (datasourceUrl.contains(":memory:")) return; // skip in-memory DBs

        String rawPath = datasourceUrl.replace("jdbc:sqlite:", "").split("\\?")[0]; // strip query params
        File dbFile = Path.of(rawPath).toAbsolutePath().toFile();
        log.info("SQLite DB path resolved to: {}", dbFile.getAbsolutePath());

        if (dbFile.length() > PURGE_THRESHOLD_BYTES) {
            int deleted = jdbcTemplate.update(
                "DELETE FROM meals WHERE logged_at < date('now', '-12 months')"
            );
            // VACUUM is required to reclaim disk space; without it dbFile.length() won't reflect freed pages
            jdbcTemplate.execute("VACUUM");
            long newSize = dbFile.length();
            log.info("Purged {} old meal rows. DB file size after VACUUM: {} MB", deleted, newSize / (1024 * 1024));

            if (dbFile.length() > PURGE_THRESHOLD_BYTES) {
                log.warn("DB file still large after purge ({} MB) — consider manual cleanup",
                         dbFile.length() / (1024 * 1024));
            }
        }
    }
}
