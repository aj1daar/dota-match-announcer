package com.github.aj1daar.dotaannouncer.dto.webhook;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.github.aj1daar.dotaannouncer.dto.PandaScoreMatchDto;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.time.LocalDateTime;

public record PandaScoreEventDto(

    // Zod equivalent: z.string().regex(/match_.*/)
    @NotNull
    @Pattern(regexp = "match_.*", message = "Event type must start with 'match_'")
    String type,

    // Zod equivalent: z.string()
    @JsonProperty("event_id")
    @NotNull
    String eventId,

    @JsonProperty("created_at")
    LocalDateTime createdAt,

    // Zod equivalent: z.object({...})
    @Valid // <--- This is crucial! It tells Java to validate the object inside.
    @NotNull
    PayloadDto payload
) {}

record PayloadDto(
    @Valid
    @NotNull
    PandaScoreMatchDto object
) {}