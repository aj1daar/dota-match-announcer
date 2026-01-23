package com.github.aj1daar.dotaannouncer.bot.handler

import com.github.aj1daar.dotaannouncer.bot.service.NotificationService
import com.github.aj1daar.dotaannouncer.dto.PandaScoreTeamDto
import org.springframework.beans.factory.ObjectProvider
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import org.springframework.web.util.UriComponentsBuilder

@Component
class SearchTeamCommandHandler(
    private val pandaScoreClient: RestClient,
    private val notificationService: ObjectProvider<NotificationService>
) : CommandHandler {
    override fun canHandle(command: String): Boolean {
        return command.startsWith("/search_team")
    }

    override fun handle(chatId: Long, command: String) {
        val teamName = command.removePrefix("/search_team").trim()
        if (teamName.isEmpty()) {
            notificationService.getObject().sendNotification(chatId, "Please provide a team name to search for.")
            return
        }

        val uri = UriComponentsBuilder
            .fromUriString("https://api.pandascore.io/dota2/teams")
            .queryParam("search", teamName)
            .build()
            .toUri()

        val teams = try {
            pandaScoreClient.get()
                .uri(uri)
                .retrieve()
                .body(Array<PandaScoreTeamDto>::class.java) ?: emptyArray()
        } catch (_: Exception) {
            emptyArray()
        }

        if (teams.isEmpty()) {
            notificationService.getObject().sendNotification(chatId, "No teams found matching '$teamName'.")
        } else {
            val response = teams.joinToString("\n") { "${it.name()} (ID: ${it.id()})" }
            notificationService.getObject().sendNotification(chatId, "Found teams:\n$response")
        }
    }
}