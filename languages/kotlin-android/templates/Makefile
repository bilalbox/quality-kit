# quality-kit kotlin-android gates — see AGENTS.quality.md
SHELL := /bin/bash
ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
QUALITY := $(ROOT)/tools/quality

.PHONY: gate gate-fast format format-fix secrets vulns screenshots-record screenshots-compare doctor help

help:
	@echo "Targets:"
	@echo "  make gate-fast            ktfmt + secrets + detekt + compile"
	@echo "  make gate                 gate-fast + osv-scanner + lint + tests + screenshots + coverage + buildHealth"
	@echo "  make format               ktfmt check"
	@echo "  make format-fix           ktfmt in place"
	@echo "  make secrets              Betterleaks scan"
	@echo "  make vulns                osv-scanner lockfile scan"
	@echo "  make screenshots-record   re-record Roborazzi goldens"
	@echo "  make screenshots-compare  write *_compare.png diffs without failing"
	@echo "  make doctor               check JDK / Android SDK / tools"

gate-fast:
	@$(QUALITY)/gate.sh fast

gate:
	@$(QUALITY)/gate.sh full

format:
	@$(QUALITY)/run-format.sh

format-fix:
	@$(QUALITY)/run-format.sh --fix

secrets:
	@$(QUALITY)/run-secret-scan.sh

vulns:
	@$(QUALITY)/run-vuln-scan.sh

screenshots-record:
	@$(QUALITY)/screenshots.sh record

screenshots-compare:
	@$(QUALITY)/screenshots.sh compare

doctor:
	@$(QUALITY)/doctor.sh
