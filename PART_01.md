# Part One: Booting

<!-- start articles with overview of what is going to be shown. split theory and implementation !-->
<!-- Mention that this might be a little more hand-holdy than later articles? (then split into theory and implementation?) !-->

<!-- Glossary list: privilege level, rings, descriptors, segments, a20, etc go through this !-->

## Syllabus

Throughout this article we will develop a large chunk of a special type of program called a bootloader. A bootloader's job is to load the OS, set up a minimal environment for it, and hand off control by jumping to it. This process is highly dependent on the x86 architecture. Below is a partial list of what an x86 bootloader is expected to do.

* Load code from the hard drive.
* Enable the A20 line.
* Install a temporary Global Descriptor Table.
* Enable Protected Mode.
* Jump to the OS!

Later on we will modify the bootloader to get a map of memory that our OS can use.

### Prerequisites

To build and run this code you are going to want to download [FASM](https://flatassembler.net/) and [QEMU](https://www.qemu.org/). Assuming you are on an Ubuntu-based system you can simply type `sudo apt-get install qemu fasm` into your terminal to install them. I will explain how to use them as needed.

### Early days

The Basic Input/Output System (BIOS) is a piece of firmware installed onto your computer to check and initialize the hardware and to find executable code on the hard drive. The code it searches for on the hard drive is called the Master Boot Record[^1] (MBR) and it must be exactly 512 bytes at the very beginning of the hard drive with the word[^2] 0xaa55 at offset 510. The BIOS will load our code at address 0x7c00 and jump to it. If you need an x86 assembly refresher please read [Appendix A](https://todo.com).

```nasm
use16
org 0x7c00

jmp $

times (510 - ($ - $$)) db 0
dw 0xaa55
```

##### How do I build and run it? (I suggest you automate this by creating a [Makefile](https://www.gnu.org/software/make/manual/html_node/index.html#Top))
```bash
# Don't clutter your code!
mkdir build
# Compile it
fasm boot.asm build/boot.bin
# This will be important later when we start to paste separate binary files together
# bs=512 sets the sector size
dd if=build/boot.bin of=build/kernel.bin bs=512
# We'll add things to this later for configuring how things will be displayed, how to receive output from serial ports for debugging, and how much memory to supply the OS.
# The -drive option is to prevent QEMU from complaining about guessing the file format.
qemu-system-i386 -drive format=raw,file=build/kernel.bin
```

This very simple code will merely boot and loop forever. The first line of code reads `use16` because your x86 CPU starts up in something called 16-bit Real Mode. Staying 16-bit Real Mode is undesirable because using it means we can only access 1 MiB (+ 64 KiB) of memory and can't use any hardware-based memory protection to stop processes from reading from and writing to other processes memory. Through the release of the [80286](https://en.wikipedia.org/wiki/Intel_80286]), Intel provided Protected Mode which was later enhanced by the [80386](https://en.wikipedia.org/wiki/Intel_80386) to have 32-bit addresses and hardware-based memory protection. Before we switch to this mode, it's necessary to load the rest of our OS from the hard drive because the MBR is limited to 512 bytes. We must do this before we switch to Protected Mode because the BIOS functions used to load the OS will not be available in 32-bit Protected Mode. There are multiple BIOS functions you could use to load sectors[^3], but I have chosen to use the "Extended Read" function. It is called by configuring registers and memory according to the chart below.

### Int 0x13

|Register|Value|
|--------|:---:|
|AH      |0x42 |
|DL      |0x80 for the first HDD (set by the BIOS)|
|DS:SI   |segment:offset address of the Disk Address Packet|

#### Disk Address Packet

| Bytes      | Use                                                 |
|:----------:|-----------------------------------------------------|
| 0x00       | Size of this packet                                 |
| 0x01       | Must be set to 0                                    |
| 0x02..0x03 | # of sectors to read                                |
| 0x04..0x07 | segment:offset address of where to read the sectors |
| 0x08..0x0f | [LBA](https://en.wikipedia.org/wiki/Logical_block_addressing) of the starting sector, first sector of the drive is 0|

#### Return Values

| Register         | Meaning      |
|------------------|--------------|
| CF               | Set on error |
| AH               | Error code (values [here](http://www.delorie.com/djgpp/doc/rbinter/it/34/2.html))|

A few caveats to this function are that it can't cross a 64 KiB boundary and some BIOSes will only read up to 127 sectors per int 0x13 call. The call cannot correctly read past a 64 KiB boundary due to the Segmentation in 16-bit Real Mode (The offset part of the "segment:offset" address would overflow as it is just 16 bits[^4], which the BIOS doesn't take into account). The "127 sectors" restriction is a shortcoming of some [Phoenix](https://en.wikipedia.org/wiki/Phoenix_Technologies) BIOSes.

#### Commented code for loading 63 sectors

```nasm
use16
org 0x7c00

;; Interrupts are not necessary here and must be disabled before entering
;; Protected Mode (to come later).
cli

;; DS is 0 because disk_address_packet's address is somewhere between
;; 0x7c00..0x7e00 which is in segment 0.
xor ax, ax
mov ds, ax
mov si, disk_address_packet

mov ah, 0x42
;; Read!
int 0x13

;; Display an error message and halt if anything goes wrong.
mov si, int13_error_msg
jc error_and_die

jmp $

error_and_die:
	;; lodsb reads value at address in si to register al
	;; it increments (or decrements if the direction flag is set)
	;; the address by 1 for each call to lodsb
	lodsb
	;; al = 0 signifies the end of the string
	test al, al
	jz @f

	;; int 0x10 is for video services.
	;; ah=0xe selects the function for writing characters to the
	;; screen al is the character to write to the screen which is
	;; loaded by lodsb.
	mov ah, 0xe
	int 0x10
	jmp error_and_die
@@:
	;; Loop forever
	cli
	hlt
	jmp @b

disk_address_packet:
	;; Size of this packet
	db 16
	;; Must be 0
	db 0
	;; # sectors to load.
	;; This value will most likely change as the kernel grows larger, but
	;; it is chosen now because it will not cause the read to pass over a
	;; 64 KiB boundary and the binary of the kernel will be exactly 32 KiB
	;; (63 * 512 (bytes per sector) + 512 (MBR).
	dw 63
	;; segment:offset of where to place the sectors
	dd 0x7e00
	;; LBA of the starting sector to read. The MBR is at LBA 0 and the rest
	;; of the code starts at LBA 1.
	dq 1

int13_error_msg: db 'Extended Read Failure... Halting', 0

times (510 - ($ - $$)) db 0
dw 0xaa55
```

If you run this code with your current commands to build and run the OS, your code will hit problems at instruction "jc error_and_die". This is because QEMU is trying to load the sectors you requested, but there weren't enough sectors to read in the file you supplied (build/kernel.bin). The solution to this I'm using currently is to pad the kernel.bin file with zeros so QEMU has 63 sectors of data to read. A more sophisticated solution would be to write a program which determines the size of the kernel and make modifications to the disk_address_packet sectors field dynamically so as to not read unnecessary sectors.

#### Changes to the build process

```bash
# Write zeros for 64 (+1 for MBR) sectors
dd if=/dev/zero of=build/kernel.bin bs=512 count=64
# conv=notrunc prevents dd from truncating the file to size 0 before it does the write.
dd if=build/boot.bin of=build/kernel.bin bs=512 conv=notrunc
```

### A20 line

The A20 line[^5] is a relic of a time gone by. It, like other skeletons in x86's closet, was borne out of the desire for backwards compatibility. It is necessary for someone developing an OS from scratch to enable it because it allows access to all memory above 1 MiB. The method we will use is called the "FAST A20" gate because (in my opinion) it is both easy to use and more importantly faster than other ways to enable the A20 line. It relies on writing to the "System Control Port A" I/O port's second bit to enable the A20 line. This method isn't supported everywhere, so it would be prudent to add other methods. The traditional way involves interfacing with the keyboard controller. Go figure.

```nasm
;; Set the second bit of port 0x92 to enable the A20 line

;; Save the current port 0x92 values in al
in al, 0x92

;; Some BIOSes enable the A20 line for you... don't write when they have.
test al, 10b
jnz already_enabled

;; Enable the second bit
or al, 10b

;; According to http://www.win.tue.nl/~aeb/linux/kbd/A20.html, writing to the
;; first bit causes a reset.
and al, 11111110b

;; Solidify enabling the A20 line
out 0x92, al
already_enabled:
```

### The Global Descriptor Table (GDT)

A valid GDT is a prerequisite to enter Protected Mode. Every attempt to read from memory will go through the GDT in order to check if the address is in range and if the code attempting to read the memory has access rights. We will use this structure to flat map the entire memory address space to obviate the need for outdated segments. When our OS starts to develop multitasking we will make changes to this structure, but for now we will set up three simple segment descriptors.

| Bytes        |Use                                              |
|:------------:|:------------------------------------------------|
| 0x00..0x01   | Limit Low (where the segment of memory ends)    |
| 0x02..0x03   | Base Low  (where the segment of memory starts)  |
| 0x04         | Base Medium                                     |
| 0x05         | Access Byte                                     |
| 0x06         | Limit High                                      |
| 0x06         | Flags                                           |
| 0x07         | Base High                                       |

#### Access Byte
The 8-bit access byte specifies the restrictions of this memory segment.

|         Name         |  Size  |
|:---------------------|:------:|
| Accessed             | 1 bit  |
| Readable/Writable    | 1 bit  |
| Direction/Conforming | 1 bit  |
| Executable           | 1 bit  |
| 1                    | 1 bit  |
| Privilege            | 2 bits |
| Present              | 1 bit  |

```plaintext
The first bit is set to 1 if the segment descriptor has been accessed by the CPU.

The second bit is the readable bit for code descriptors and the writable bit for the data descriptors.

* Code descriptor:
	* If 1, the segment is readable.
	* If 0, the segment is not readable.
* Data descriptor:
	* If 1, the segment is writable.
	* If 0, the segment is not writable.

The third bit is the conforming bit for code descriptors and the direction bit for data descriptors.

* Code descriptor:
	* If 1, this code can be executed from lower privilege levels. This would mean that ring 2 could be jumped to from ring 3.
	* If 0, this code can only be executed from equal privilege levels.
* Data descriptor:
	* If 1, the segment grows down (address > limit).
	* If 0, the segment grows up (address < limit).

The fourth bit is set to one if it is a code descriptor, and zero if it is a data descriptor.

The fifth bit must be set to 1.

The sixth and seventh bits are the privilege bits. These specify the ring level of the segment. 0 represents a kernel descriptor, whereas a 3 would represent a user-level application.

The eighth bit is the present bit which must be set to 1 for every used descriptor.
```

#### Flags Nibble
The flags nibble[^6] specifies attributes about the descriptor instead of the segment.

|    Name    |  Size  |
|------------|:------:|
|0           | 2 bits |
|Segment Size| 1 bit  |
|Granulartity| 1 bit  |

```plaintext
The first and second bits must be set to 0.

The third bit is the size bit
	* Set to 0 if this descriptor defines a 16-bit Protected Mode segment.
	* Set to 1 if this descriptor defines a 32-bit Protected Mode segment.

The fourth bit is the granularity bit
	* Set to 0 if the limit part of the structure is in byte granularity.
	* Set to 1 if the limit part of the structure is in page granularity.
```

That's a lot of information about GDT entries (which are only 8 bytes)! I implore you to digest as much as you can, but don't worry if you don't understand the theory before you see the implementation.

### Loading the GDT

The GDT must be loaded by the privileged x86 instruction `lgdt`. It expects an argument (called the GDT Register) which tells it the address in memory of the GDT and how big it is.

#### GDT Register Layout

|  Name             |   Size  |
|:-----------------:|:-------:|
|  Size (minus 1)   | 16 bits |
|  Address          | 32 bits |

### This OS's use

Our OS presently will only use three simple segment descriptors: one for nothing[^7], one for kernel code, and one for kernel data. They will overlap and span the entire address space because we want the flat memory model us programmers enjoy in the modern era. This will free us from the horrors of worrying having to worry if an address if in range of a specific segment. It's true that using segmentation could allow us to implement a form of memory protection, but we'll see later that there are better options.

##### Commented code of loading a GDT.
```nasm
lgdt [gdt_register]

gdt_register:
	dw gdt_end - gdt - 1
	dd gdt
	
gdt:
	;; Null Descriptor
	dq 0

	;; Code Descriptor
	
	;; Base: 0
	;; Limit: 0xffffffff
	
	;; Not accessed yet
	;; Readable
	;; Must be executed from the same privilege level
	;; Code descriptor
	;; Always 1
	;; Ring 0
	;; Present
	dw 0xffff
	dw 0
	db 0
	db 10011010b
	db 11001111b
	db 0

	;; Data Descriptor
	
	;; Base: 0
	;; Limit: 0xffffffff
	
	;; Not accessed yet
	;; Writable
	;; Grows up; address < limit
	;; Data descriptor
	;; Always 1
	;; Ring 0
	;; Present
	dw 0xffff
	dw 0
	db 0
	db 10010010b
	db 11001111b
	db 0
```

<!--implicit 0x10:address in memory!-->

[^1]: The Master Boot Record should also store information on how the partitions of the hard drive are organized. Our OS's code will ignore this for the time being.
[^2]: A word refers to 16-bits of contiguous memory.
[^3]: Hard drive speak for 512 contiguous bytes.
[^4]: 16 bits can hold a maximum value of 0xffff. This is equivalent to 64 KiB.
[^5]: The name comes from the fact that it is the 20th (0-based) **A**ddress line.
[^6]: A nibble is 4 bits.
[^7]: Why? Because Intel told us to do so!
