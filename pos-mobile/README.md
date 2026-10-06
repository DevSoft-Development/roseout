# ThePOSHaven Cashier App

This is the dedicated cashier/mobile runtime for ThePOSHaven.

## Isolation

- iOS bundle identifier: `com.theposhaven.app`
- Android package: `com.theposhaven.app`
- Consumer app `com.theouthaven.app` is not used for POS hardware access.
- Local-network, Bonjour/mDNS, printer TCP, and managed-hardware permissions belong here only.

## Hardware model

The app uses a thin `ThePosHavenHardware` native bridge. Business routing is by
device identity, location, role, and station. IP addresses are transport details
and are never treated as device identity.

The initial foundation intentionally keeps native hardware implementation behind
the bridge so iOS and Android adapters remain replaceable.
