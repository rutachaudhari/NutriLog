package com.nutrilog.controller;

import com.nutrilog.exception.ProfileNotFoundException;
import com.nutrilog.repository.ProfileRepository;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

@RestController
public class SummaryController {

    private final JdbcTemplate jdbc;
    private final ProfileRepository profileRepository;

    public SummaryController(JdbcTemplate jdbc, ProfileRepository profileRepository) {
        this.jdbc = jdbc;
        this.profileRepository = profileRepository;
    }

    @GetMapping("/summary")
    public Map<String, Map<String, Double>> getSummary(
            @RequestParam("profile_id") Long profileId,
            @RequestParam("date") String date) {

        // Explicit profile check: COALESCE(SUM(...), 0) returns zeros for missing profiles
        profileRepository.findById(profileId)
                .orElseThrow(() -> new ProfileNotFoundException(profileId));

        // Daily totals
        Map<String, Double> dateTotals = queryTotals(
                "SELECT COALESCE(SUM(calories),0), COALESCE(SUM(protein_g),0), " +
                "COALESCE(SUM(fat_g),0), COALESCE(SUM(fiber_g),0) " +
                "FROM meals WHERE profile_id = ? AND DATE(logged_at) = ?",
                profileId, date
        );

        // Weekly totals using ISO week Monday–Sunday computed in Java
        LocalDate parsedDate = LocalDate.parse(date);
        LocalDate monday = parsedDate.with(DayOfWeek.MONDAY);
        LocalDate sunday = monday.plusDays(6);

        Map<String, Double> weekTotals = queryTotals(
                "SELECT COALESCE(SUM(calories),0), COALESCE(SUM(protein_g),0), " +
                "COALESCE(SUM(fat_g),0), COALESCE(SUM(fiber_g),0) " +
                "FROM meals WHERE profile_id = ? AND DATE(logged_at) BETWEEN ? AND ?",
                profileId, monday.toString(), sunday.toString()
        );

        Map<String, Map<String, Double>> response = new HashMap<>();
        response.put("date_totals", dateTotals);
        response.put("week_totals", weekTotals);
        return response;
    }

    private Map<String, Double> queryTotals(String sql, Object... args) {
        return jdbc.queryForObject(sql, (rs, rowNum) -> {
            Map<String, Double> totals = new HashMap<>();
            totals.put("calories", rs.getDouble(1));
            totals.put("protein_g", rs.getDouble(2));
            totals.put("fat_g", rs.getDouble(3));
            totals.put("fiber_g", rs.getDouble(4));
            return totals;
        }, args);
    }
}
