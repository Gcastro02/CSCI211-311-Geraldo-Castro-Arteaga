CXX = g++
CXXFLAGS = -std=c++17 -Wall -O2 -Iinclude

TRADER = trader
TRADER_SRC = trader.cpp

# Superseded first version. Needs libcurl, so it is not part of `make all`.
LEGACY = legacy-alphavantage
LEGACY_SRC = legacy-alphavantage.cpp

all: $(TRADER)

$(TRADER): $(TRADER_SRC)
	$(CXX) $(CXXFLAGS) $< -o $@
	@echo "✓ Built: $@"

$(LEGACY): $(LEGACY_SRC)
	$(CXX) $(CXXFLAGS) $< -o $@ -lcurl
	@echo "✓ Built: $@"

legacy: $(LEGACY)

# Evaluate and print without writing state or the trade log.
dry-run: $(TRADER)
	./$(TRADER) --dry-run

run: $(TRADER) check-model
	./$(TRADER)

check-model:
	@if [ ! -f ml_model/models/stock_classifier.pkl ]; then \
		echo "ERROR: model not found. Run: make setup-ml"; \
		exit 1; \
	fi

# Download training data and fit the model.
setup-ml:
	cd ml_model && bash setup.sh

test-ml: check-model
	cd ml_model && python3 predict.py AAPL && python3 predict.py --batch VOO,MSFT

clean:
	rm -f $(TRADER) $(LEGACY)
	@echo "✓ Cleaned"

clean-ml:
	rm -f ml_model/data/*.pkl
	rm -f ml_model/models/*.pkl ml_model/models/*.json
	@echo "✓ Cleaned model files (run 'make setup-ml' to retrain)"

clean-all: clean clean-ml

help:
	@echo "Make targets:"
	@echo "  make            - Build the trader"
	@echo "  make run        - Run it (writes state and the trade log)"
	@echo "  make dry-run    - Evaluate and print, writing nothing"
	@echo "  make setup-ml   - Download data and train the model"
	@echo "  make test-ml    - Sanity-check model predictions"
	@echo "  make legacy     - Build the superseded Alpha Vantage version (needs libcurl)"
	@echo "  make clean      - Remove binaries"
	@echo "  make clean-ml   - Remove model files"
	@echo "  make clean-all  - Remove everything generated"

.PHONY: all legacy run dry-run setup-ml test-ml check-model clean clean-ml clean-all help
