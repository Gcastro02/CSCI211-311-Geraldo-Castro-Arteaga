eco: main.o DataList.o
	g++ -Wall -pedantic -g -std=c++17 -o eco main.o DataList.o

main.o: main.cpp MonthlyData.h DataList.h
	g++ -Wall -pedantic -g -std=c++17 -c main.cpp

Datalist.o: DataList.h DataList.cpp MonthlyData.h
	g++ -Wall -pedantic -g -std=c++17 -c DataList.cpp 

clean:
	rm -f DataList.o main.o eco
	