package com.nutrilog.repository;

import com.nutrilog.model.Profile;
import com.nutrilog.service.CalorieGoalService;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Optional;

@Repository
public class ProfileRepository {

    private final JdbcTemplate jdbc;
    private final CalorieGoalService calorieGoalService;
    private final RowMapper<Profile> rowMapper;

    public ProfileRepository(JdbcTemplate jdbc, CalorieGoalService calorieGoalService) {
        this.jdbc = jdbc;
        this.calorieGoalService = calorieGoalService;
        this.rowMapper = (rs, rowNum) -> mapRow(rs);
    }

    private Profile mapRow(ResultSet rs) throws SQLException {
        Profile p = new Profile();
        p.setId(rs.getLong("id"));
        p.setName(rs.getString("name"));
        p.setCreatedAt(rs.getString("created_at"));
        p.setAge(nullableInt(rs, "age"));
        p.setGender(rs.getString("gender"));
        p.setHeightCm(nullableDouble(rs, "height_cm"));
        p.setCurrentWeightKg(nullableDouble(rs, "current_weight_kg"));
        p.setTargetWeightKg(nullableDouble(rs, "target_weight_kg"));
        p.setActivityLevel(rs.getString("activity_level"));
        p.setWeeklyRateKg(nullableDouble(rs, "weekly_rate_kg"));
        p.setRecommendedDailyCalories(nullableDouble(rs, "recommended_daily_calories"));

        // Compute weeksToTarget (not stored)
        Double weeksToTarget = calorieGoalService.computeWeeksToTarget(
                p.getCurrentWeightKg(), p.getTargetWeightKg(), p.getWeeklyRateKg());
        p.setWeeksToTarget(weeksToTarget);

        return p;
    }

    private static Integer nullableInt(ResultSet rs, String col) throws SQLException {
        int val = rs.getInt(col);
        return rs.wasNull() ? null : val;
    }

    private static Double nullableDouble(ResultSet rs, String col) throws SQLException {
        double val = rs.getDouble(col);
        return rs.wasNull() ? null : val;
    }

    public List<Profile> findAll() {
        return jdbc.query("SELECT * FROM profiles ORDER BY id", rowMapper);
    }

    public Optional<Profile> findById(Long id) {
        try {
            Profile p = jdbc.queryForObject("SELECT * FROM profiles WHERE id = ?", rowMapper, id);
            return Optional.ofNullable(p);
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }

    public Profile save(Profile profile) {
        KeyHolder keyHolder = new GeneratedKeyHolder();

        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO profiles (name, age, gender, height_cm, current_weight_kg, " +
                    "target_weight_kg, activity_level, weekly_rate_kg, recommended_daily_calories) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS
            );
            ps.setObject(1, profile.getName());
            ps.setObject(2, profile.getAge());
            ps.setObject(3, profile.getGender());
            ps.setObject(4, profile.getHeightCm());
            ps.setObject(5, profile.getCurrentWeightKg());
            ps.setObject(6, profile.getTargetWeightKg());
            ps.setObject(7, profile.getActivityLevel());
            ps.setObject(8, profile.getWeeklyRateKg());
            ps.setObject(9, profile.getRecommendedDailyCalories());
            return ps;
        }, keyHolder);

        long id = keyHolder.getKey().longValue();
        return findById(id).orElseThrow();
    }

    public Profile update(Profile profile) {
        jdbc.update(
                "UPDATE profiles SET name = ?, age = ?, gender = ?, height_cm = ?, " +
                "current_weight_kg = ?, target_weight_kg = ?, activity_level = ?, " +
                "weekly_rate_kg = ?, recommended_daily_calories = ? WHERE id = ?",
                profile.getName(),
                profile.getAge(),
                profile.getGender(),
                profile.getHeightCm(),
                profile.getCurrentWeightKg(),
                profile.getTargetWeightKg(),
                profile.getActivityLevel(),
                profile.getWeeklyRateKg(),
                profile.getRecommendedDailyCalories(),
                profile.getId()
        );
        return findById(profile.getId()).orElseThrow();
    }

    public int deleteById(Long id) {
        return jdbc.update("DELETE FROM profiles WHERE id = ?", id);
    }
}
