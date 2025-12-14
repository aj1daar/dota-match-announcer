package com.github.aj1daar.dotaannouncer.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.time.LocalDateTime;


@Entity
@Table(name = "matches")
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
public class Match {
    @Id
    private Long id;

    private String teamOne;
    private String teamTwo;
    private String tournamentName;
    private LocalDateTime startTime;

    @Enumerated(EnumType.STRING)
    private MatchFormat format;

    private boolean announced;

    public String getDisplayName() { return teamOne + " vs " + teamTwo; }
}
