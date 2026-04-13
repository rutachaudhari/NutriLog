package com.nutrilog.model;

import java.util.List;
import java.util.Map;

public class ParseResponse {

    private List<ParsedFoodItem> items;
    private Map<String, Double> totals;

    public ParseResponse(List<ParsedFoodItem> items, Map<String, Double> totals) {
        this.items = items;
        this.totals = totals;
    }

    public List<ParsedFoodItem> getItems() { return items; }
    public Map<String, Double> getTotals() { return totals; }
}
