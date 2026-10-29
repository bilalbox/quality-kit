# quality-kit dart gates — see languages/dart/MODULE.md / AGENTS.quality.md
SHELL := /bin/bash
ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
QUALITY := $(ROOT)/tools/quality

.PHONY: gate gate-fast format analyze deps secrets test help

help:
	@echo "Targets:"
	@echo "  make gate-fast  format + analyze + secrets + deps"
	@echo "  make gate       gate-fast + flutter test"
	@echo "  make format     dart format --set-exit-if-changed"
	@echo "  make analyze    flutter/dart analyze --fatal-infos"
	@echo "  make deps       dependency_validator"
	@echo "  make secrets    Betterleaks scan"
	@echo "  make test       flutter/dart test"

gate-fast:
	@$(QUALITY)/gate.sh fast

gate:
	@$(QUALITY)/gate.sh full

format:
	@$(QUALITY)/run-format.sh

analyze:
	@$(QUALITY)/run-analyze.sh

deps:
	@$(QUALITY)/run-deps.sh

secrets:
	@$(QUALITY)/run-secret-scan.sh

test:
	@$(QUALITY)/run-test.sh
