package com.github.aj1daar.dotaannouncer.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.FutureOrPresent;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDateTime;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record PandaScoreMatchDto(

    @NotNull
    Long id,

    @NotNull
    String name,

    @JsonProperty("begin_at")
    @FutureOrPresent(message = "Match date cannot be in the past")
    LocalDateTime beginAt,

    @JsonProperty("number_of_games")
    @Min(1)
    int numberOfGames, // This maps to BO1, BO3, etc.

    @NotNull
    @Valid
    LeagueDto league,

    @NotNull
    @Valid
    List<OpponentWrapperDto> opponents
) {
  @JsonIgnoreProperties(ignoreUnknown = true)
  public record LeagueDto(
      @NotNull String name
  ) {}

  // PandaScore structure is slightly weird:
// "opponents": [ { "opponent": { "name": "Team Spirit" } } ]
  @JsonIgnoreProperties(ignoreUnknown = true)
  public record OpponentWrapperDto(
      @Valid OpponentDto opponent
  ) {}

  @JsonIgnoreProperties(ignoreUnknown = true)
  public record OpponentDto(
      @NotNull Long id,
      @NotNull String name,
      String acronym
  ) {}
}
