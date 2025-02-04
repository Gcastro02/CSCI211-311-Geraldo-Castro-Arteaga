# simple makefile

# This rule tells make how to "make" the executable foobar
foobar: main.o foo.o bar.o
	g++ -Wall -pedantic -g -o foobar main.o foo.o bar.o

# This rule tells make how to "make" the object file main.o
main.o: main.cpp foo.h
	g++ -Wall -pedantic -g -std=c++11 -c main.cpp

# This rule tells make how to "make" the object file foo.o
foo.o: foo.cpp foo.h
	g++ -Wall -pedantic -g -std=c++11 -c foo.cpp

# This rule tells make how to "make" the object file bar.o
bar.o: bar.cpp bar.h
	g++ -Wall -pedantic -g -std=c++11 -c bar.cpp

# This rule tells make what to delete when the user types "make clean"
# BE VERY CAREFUL to only put generated files here
clean:
	rm -f foobar main.o foo.o bar.o