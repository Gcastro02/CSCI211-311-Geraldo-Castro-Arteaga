CXX = g++
CXXFLAGS = -std=c++17 -Wall -O2 -Iinclude

# Original version (without ML)
ORIGINAL = Roth-IRA
ORIGINAL_SRC = Roth-IRA.cpp

# ML-integrated version
ML_VERSION = Roth-IRA-ML
ML_SRC = Roth-IRA-ML.cpp

# Default target
all: $(ORIGINAL) $(ML_VERSION)

# Build original version
$(ORIGINAL): $(ORIGINAL_SRC)
	$(CXX) $(CXXFLAGS) $< -o $@
	@echo "✓ Built: $@"

# Build ML-integrated version
$(ML_VERSION): $(ML_SRC)
	$(CXX) $(CXXFLAGS) $< -o $@
	@echo "✓ Built: $@"

# Run original version
run-original: $(ORIGINAL)
	./$(ORIGINAL)

# Run ML version (requires trained model)
run-ml: $(ML_VERSION) check-ml-model
	./$(ML_VERSION)

# Check if ML model is ready
check-ml-model:
	@if [ ! -f ml_model/models/stock_classifier.pkl ]; then \
		echo "ERROR: ML model not found!"; \
		echo "Run: cd ml_model && bash setup.sh"; \
		exit 1; \
	fi

# Setup ML environment and train model
setup-ml:
	cd ml_model && bash setup.sh

# Quick test of ML predictions
test-ml: check-ml-model
	cd ml_model && python3 predict.py AAPL && python3 predict.py --batch VOO,MSFT

# Clean build artifacts
clean:
	rm -f $(ORIGINAL) $(ML_VERSION)
	@echo "✓ Cleaned"

# Clean ML model and data (requires re-training)
clean-ml:
	rm -f ml_model/data/*.pkl
	rm -f ml_model/models/*.pkl ml_model/models/*.json
	@echo "✓ Cleaned ML models (run 'make setup-ml' to retrain)"

# Full clean
clean-all: clean clean-ml

help:
	@echo "Make targets:"
	@echo "  make               - Build both versions"
	@echo "  make $(ORIGINAL)   - Build original version (no ML)"
	@echo "  make $(ML_VERSION) - Build ML-integrated version"
	@echo "  make run-original  - Run original bot"
	@echo "  make run-ml        - Run ML bot (must train model first)"
	@echo "  make setup-ml      - Download data and train ML model"
	@echo "  make test-ml       - Test ML predictions"
	@echo "  make check-ml-model - Verify ML model files exist"
	@echo "  make clean         - Remove binaries"
	@echo "  make clean-ml      - Remove ML model files"
	@echo "  make clean-all     - Remove all generated files"

.PHONY: all run-original run-ml setup-ml test-ml check-ml-model clean clean-ml clean-all help
