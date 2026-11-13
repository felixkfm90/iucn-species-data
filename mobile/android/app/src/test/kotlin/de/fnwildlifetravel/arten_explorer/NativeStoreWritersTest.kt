package de.fnwildlifetravel.arten_explorer

/** Direct JVM qualification of the real arbiter; no Android mocks, SDK runtime or JUnit dependency. */
object NativeStoreWritersTest {
    private fun rejects(reason: String, operation: () -> Unit) {
        val error = try { operation(); null } catch (failure: OfflineDownloadException) { failure }
        check(error?.reason == reason) { "Expected $reason, got ${error?.reason ?: "success"}" }
    }

    @JvmStatic fun main(args: Array<String>) {
        var cases = 0
        fun scenario(name: String, operation: (Any, Any) -> Unit) {
            val first = Any(); val second = Any()
            try { operation(first, second); cases++ }
            catch (failure: Throwable) { throw AssertionError(name, failure) }
            finally { NativeStoreWriters.releaseOwner(first); NativeStoreWriters.releaseOwner(second) }
        }
        val key = "a".repeat(64); val otherKey = "b".repeat(64)
        scenario("same key excludes both a second engine and reentrant acquisition") { first, second ->
            val lease = NativeStoreWriters.acquire(first, key)
            check(Regex("^[a-f0-9]{32}$").matches(lease))
            rejects("store_writer_busy") { NativeStoreWriters.acquire(second, key) }
            rejects("store_writer_busy") { NativeStoreWriters.acquire(first, key) }
        }
        scenario("independent stores remain usable") { first, second ->
            NativeStoreWriters.acquire(first, key)
            NativeStoreWriters.acquire(second, otherKey)
        }
        scenario("foreign owner cannot release the exact known lease") { first, second ->
            val lease = NativeStoreWriters.acquire(first, key)
            rejects("writer_lease_changed") { NativeStoreWriters.release(second, lease) }
            rejects("store_writer_busy") { NativeStoreWriters.acquire(second, key) }
        }
        scenario("forged or previously released lease cannot release the next writer") { first, second ->
            val lease = NativeStoreWriters.acquire(first, key)
            rejects("writer_lease_changed") { NativeStoreWriters.release(first, "0".repeat(32)) }
            NativeStoreWriters.release(first, lease)
            NativeStoreWriters.acquire(second, key)
            rejects("writer_lease_changed") { NativeStoreWriters.release(first, lease) }
            rejects("store_writer_busy") { NativeStoreWriters.acquire(first, key) }
        }
        scenario("exact owner release frees only its leases") { first, second ->
            NativeStoreWriters.acquire(first, key)
            NativeStoreWriters.acquire(second, otherKey)
            NativeStoreWriters.releaseOwner(Any())
            rejects("store_writer_busy") { NativeStoreWriters.acquire(second, key) }
            NativeStoreWriters.releaseOwner(first)
            NativeStoreWriters.acquire(second, key)
            rejects("store_writer_busy") { NativeStoreWriters.acquire(first, otherKey) }
            NativeStoreWriters.releaseOwner(second)
            NativeStoreWriters.acquire(first, key)
            NativeStoreWriters.acquire(first, otherKey)
        }
        scenario("invalid keys and leases never alter existing ownership") { first, second ->
            val lease = NativeStoreWriters.acquire(first, key)
            for (invalid in listOf(null, "A".repeat(64), "a".repeat(63), "../store", 42)) {
                rejects("invalid_writer_key") { NativeStoreWriters.acquire(second, invalid) }
            }
            for (invalid in listOf(null, "A".repeat(32), "short", 42)) {
                rejects("invalid_writer_lease") { NativeStoreWriters.release(first, invalid) }
            }
            rejects("store_writer_busy") { NativeStoreWriters.acquire(second, key) }
            NativeStoreWriters.release(first, lease)
            NativeStoreWriters.acquire(second, key)
        }
        println("NativeStoreWriters: $cases/6 behavioural scenarios passed")
    }
}
