package com.github.aj1daar.dotaannouncer.bot.service

import org.springframework.stereotype.Service

@Service
class MessageCleanupService {
    // Store the last message ID for each chat for cleanup purposes
    private val lastMessageIds = mutableMapOf<Long, Int>()

    fun storeMessageId(chatId: Long, messageId: Int) {
        lastMessageIds[chatId] = messageId
    }

    fun getLastMessageId(chatId: Long): Int? {
        return lastMessageIds[chatId]
    }

    fun clearLastMessageId(chatId: Long) {
        lastMessageIds.remove(chatId)
    }
}
