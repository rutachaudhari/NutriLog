package com.nutrilog.repository;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.NullNode;
import com.nutrilog.model.Meal;
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
import java.util.Objects;

@Repository
public class MealRepository {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final RowMapper<Meal> rowMapper;

    public MealRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.rowMapper = (rs, rowNum) -> mapRow(rs);
    }

    private Meal mapRow(ResultSet rs) throws SQLException {
        Meal meal = new Meal();
        meal.setId(rs.getLong("id"));
        meal.setProfileId(rs.getLong("profile_id"));
        meal.setLoggedAt(rs.getString("logged_at"));
        meal.setDescription(rs.getString("description"));
        meal.setCalories(nullableDouble(rs, "calories"));
        meal.setProteinG(nullableDouble(rs, "protein_g"));
        meal.setFatG(nullableDouble(rs, "fat_g"));
        meal.setFiberG(nullableDouble(rs, "fiber_g"));

        String itemsJsonStr = rs.getString("items_json");
        if (itemsJsonStr != null && !itemsJsonStr.isBlank()) {
            try {
                JsonNode node = objectMapper.readTree(itemsJsonStr);
                meal.setItemsJson(node);
            } catch (Exception e) {
                meal.setItemsJson(NullNode.getInstance());
            }
        } else {
            meal.setItemsJson(NullNode.getInstance());
        }

        return meal;
    }

    private static Double nullableDouble(ResultSet rs, String col) throws SQLException {
        double val = rs.getDouble(col);
        return rs.wasNull() ? null : val;
    }

    public Meal save(Meal meal) {
        KeyHolder keyHolder = new GeneratedKeyHolder();

        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO meals (profile_id, description, calories, protein_g, fat_g, fiber_g, items_json) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS
            );
            ps.setObject(1, meal.getProfileId());
            ps.setObject(2, meal.getDescription());
            ps.setObject(3, meal.getCalories());
            ps.setObject(4, meal.getProteinG());
            ps.setObject(5, meal.getFatG());
            ps.setObject(6, meal.getFiberG());
            // itemsJson on Meal is a JsonNode; for save we receive a String from the controller
            // The controller sets a raw string via a transient holder — handled below
            ps.setObject(7, meal.getItemsJsonRaw());
            return ps;
        }, keyHolder);

        long id = Objects.requireNonNull(keyHolder.getKey(), "Insert did not return generated key").longValue();
        return findById(id);
    }

    public List<Meal> findByProfileIdAndDate(Long profileId, String date) {
        return jdbc.query(
                "SELECT * FROM meals WHERE profile_id = ? AND DATE(logged_at) = ? ORDER BY logged_at ASC",
                rowMapper,
                profileId, date
        );
    }

    public int deleteById(Long id) {
        return jdbc.update("DELETE FROM meals WHERE id = ?", id);
    }

    private Meal findById(Long id) {
        return jdbc.queryForObject("SELECT * FROM meals WHERE id = ?", rowMapper, id);
    }
}
