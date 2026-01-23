package com.github.aj1daar.dotaannouncer.bot.handler

interface CommandHandler {
    fun canHandle(command: String): Boolean
    fun handle(chatId: Long, command: String)
}