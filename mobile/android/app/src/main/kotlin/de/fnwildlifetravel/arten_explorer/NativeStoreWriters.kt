package de.fnwildlifetravel.arten_explorer

import java.util.UUID

/** Dart/Linux file locks are process-wide: separate Flutter engines also need this shared guard. */
internal object NativeStoreWriters {
    private data class Writer(val owner: Any, val lease: String)
    private val writers = mutableMapOf<String, Writer>()
    private val keyPattern = Regex("^[a-f0-9]{64}$")
    private val leasePattern = Regex("^[a-f0-9]{32}$")

    @Synchronized fun acquire(owner: Any, storeKey: Any?): String {
        val key = (storeKey as? String)?.takeIf(keyPattern::matches)
            ?: throw OfflineDownloadException("invalid_writer_key", "Die lokale Speichersperre ist ungültig.")
        if (writers.containsKey(key) || writers.size >= 64) {
            throw OfflineDownloadException("store_writer_busy", "Dieser Offline-Speicher wird bereits bearbeitet.")
        }
        val lease = UUID.randomUUID().toString().replace("-", "")
        writers[key] = Writer(owner, lease)
        return lease
    }

    @Synchronized fun release(owner: Any, value: Any?) {
        val lease = (value as? String)?.takeIf(leasePattern::matches)
            ?: throw OfflineDownloadException("invalid_writer_lease", "Die lokale Speichersperre ist ungültig.")
        val entry = writers.entries.firstOrNull { it.value.lease == lease && it.value.owner === owner }
            ?: throw OfflineDownloadException("writer_lease_changed", "Diese Speichersperre gehört nicht zu diesem Vorgang.")
        writers.remove(entry.key)
    }

    @Synchronized fun releaseOwner(owner: Any) { writers.entries.removeAll { it.value.owner === owner } }
}
