# quality-kit python gates — see languages/python/MODULE.md / AGENTS.quality.md
SHELL := /bin/bash
ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
QUALITY := $(ROOT)/tools/quality
PY_Q := $(QUALITY)/python

.PHONY: gate gate-fast format lint types boundaries deadcode secrets vulns test help

help:
	@echo "Targets:"
	@echo "  make gate-fast  format + lint + types + boundaries + deadcode + secrets"
	@echo "  make gate       gate-fast + osv-scanner + pytest"
	@echo "  make format     ruff format --check"
	@echo "  make lint       ruff check"
	@echo "  make types      basedpyright (project env)"
	@echo "  make boundaries tach check"
	@echo "  make deadcode   vulture"
	@echo "  make secrets    Betterleaks scan"
	@echo "  make vulns      osv-scanner lockfile scan"
	@echo "  make test       pytest"

gate-fast:
	@$(QUALITY)/gate.sh fast

gate:
	@$(QUALITY)/gate.sh full

format:
	@$(PY_Q)/run-format.sh

lint:
	@$(PY_Q)/run-lint.sh

types:
	@$(PY_Q)/run-types.sh

boundaries:
	@$(PY_Q)/run-boundaries.sh

deadcode:
	@$(PY_Q)/run-deadcode.sh

secrets:
	@$(QUALITY)/run-secret-scan.sh

vulns:
	@$(QUALITY)/run-vuln-scan.sh

test:
	@$(PY_Q)/run-test.sh
