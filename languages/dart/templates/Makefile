# quality-kit dart gates — see languages/dart/MODULE.md / AGENTS.quality.md
SHELL := /bin/bash
ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
QUALITY := $(ROOT)/tools/quality
DART_Q := $(QUALITY)/dart

.PHONY: gate gate-fast format analyze deps secrets vulns test help

help:
	@echo "Targets:"
	@echo "  make gate-fast  format + analyze + secrets + deps"
	@echo "  make gate       gate-fast + osv-scanner + flutter test"
	@echo "  make format     dart format --set-exit-if-changed"
	@echo "  make analyze    flutter/dart analyze --fatal-infos"
	@echo "  make deps       dependency_validator"
	@echo "  make secrets    Betterleaks scan"
	@echo "  make vulns      osv-scanner lockfile scan"
	@echo "  make test       flutter/dart test"

gate-fast:
	@$(QUALITY)/gate.sh fast

gate:
	@$(QUALITY)/gate.sh full

format:
	@$(DART_Q)/run-format.sh

analyze:
	@$(DART_Q)/run-analyze.sh

deps:
	@$(DART_Q)/run-deps.sh

secrets:
	@$(QUALITY)/run-secret-scan.sh

vulns:
	@$(QUALITY)/run-vuln-scan.sh

test:
	@$(DART_Q)/run-test.sh
