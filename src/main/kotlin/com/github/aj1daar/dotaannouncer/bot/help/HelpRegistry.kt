package com.github.aj1daar.dotaannouncer.bot.help

class HelpRegistry {
    val commands: List<HelpCommand> = listOf(
        HelpCommand("/start", "Register and get a welcome message."),
        HelpCommand("/help", "Show available commands."),
        HelpCommand("/search_team <name>", "Search for a Dota team and follow it."),
        HelpCommand("/my_teams", "Show all teams you are following.")
    )

    val byCommand: Map<String, HelpCommand> = commands.associateBy { it.command }

    companion object {
        val commands: List<HelpCommand> = HelpRegistry().commands
        val byCommand: Map<String, HelpCommand> = HelpRegistry().byCommand
    }
}