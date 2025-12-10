package com.github.aj1daar.dotaannouncer.model;

import lombok.Getter;

@Getter
public enum MatchFormat {
    BO1(1, false),
    BO2(2, true),
    BO3(3, false),
    BO5(5, false);

    private final int MaxGames;
    private final boolean canDraw;

    MatchFormat(int maxGames, boolean canDraw) {
        this.MaxGames = maxGames;
        this.canDraw = canDraw;
    }

    public static MatchFormat fromGameCount(int count){
        return switch (count){
            case 1 -> BO1;
            case 2 -> BO2;
            case 3 -> BO3;
            case 5 -> BO5;
            default -> BO3;
        };

    }
}
