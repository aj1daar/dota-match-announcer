package com.github.aj1daar.dotaannouncer.dto.webhook;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.github.aj1daar.dotaannouncer.dto.PandaScoreMatchDto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.time.LocalDateTime;

public record PandaScoreEventDto(

    @NotNull
    @Pattern(regexp = "match_.*", message = "Event type must start with 'match_'")
    String type,

    @JsonProperty("event_id")
    @NotNull
    String eventId,

    @JsonProperty("created_at")
    LocalDateTime createdAt,

    @Valid
    @NotNull
    PayloadDto payload
) {
    public record PayloadDto(
        @Valid
        @NotNull
        PandaScoreMatchDto object
    ) {}
}