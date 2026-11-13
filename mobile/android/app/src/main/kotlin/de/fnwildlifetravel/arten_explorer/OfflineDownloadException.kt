package de.fnwildlifetravel.arten_explorer

internal class OfflineDownloadException(val reason: String, override val message: String) : Exception(message)
