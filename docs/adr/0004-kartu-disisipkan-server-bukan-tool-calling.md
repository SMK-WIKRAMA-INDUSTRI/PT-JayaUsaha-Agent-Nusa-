# Kartu Rencana Alokasi dan Penawaran Produk disisipkan oleh server, bukan lewat tool calling

Status: diterima, sebagian diubah oleh [ADR 0006](0006-tool-calling-hanya-untuk-mengenali-niat.md) (tool calling dipakai untuk mengenali niat; kartu tetap disisipkan server).

Server yang memutuskan kapan Rencana Alokasi dan Penawaran Produk muncul, menghitung isinya, lalu menyisipkannya ke Sesi Percakapan sebagai pesan terstruktur (kartu). Model AI hanya menulis narasi di sekitar kartu tersebut. Kami tidak memakai function calling, misalnya `tawarkan_produk()`, karena hasilnya lebih sulit diprediksi, sulit membuktikan bahwa Momen Penawaran dan filter Profil Risiko dipatuhi, dan belum pasti apakah proxy Netra Runtime meneruskan function calling dengan baik. Tool calling bisa ditambahkan nanti, khusus untuk momen ketika Nasabah bertanya sendiri.
