#!/bin/bash
# Run a forge or cast command with the deployer keystore unlocked.
#
#   script/with-deployer.sh cast send --account monad-deployer --rpc-url monad_testnet <args>
#   script/with-deployer.sh forge script script/Deploy.s.sol:Deploy --account monad-deployer --broadcast --rpc-url monad_testnet
#
# The password comes from a macOS Keychain item, `monad-deployer-keystore`
# unless DEPLOYER_KEYCHAIN_ITEM names another. Foundry only accepts a password
# file, not a pipe or a FIFO, so it lands in a 0600 temp file that is removed
# when the command exits. It never appears in a command argument or in shell
# history. Set it up once with:
#
#   security add-generic-password -a "$USER" -s monad-deployer-keystore -w
#
set -euo pipefail
umask 077
pw=$(mktemp "${TMPDIR:-/tmp}/.deployerpw.XXXXXX")
trap 'rm -f "$pw"' EXIT INT TERM
security find-generic-password -w -s "${DEPLOYER_KEYCHAIN_ITEM:-monad-deployer-keystore}" | tr -d '\n' >"$pw"
ETH_PASSWORD="$pw" "$@"
