package com.github.aj1daar.dotaannouncer.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public record PandaScoreTeamDto(
    Long id,
    String name,
    String acronym,
    String country,
    @JsonProperty("image_url") String imageUrl
) {
}
