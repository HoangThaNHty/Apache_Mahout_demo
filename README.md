# Demo Apache Mahout — đọc CSV và minh họa thuật toán

Demo chạy thuật toán gợi ý **thật** bằng Java + Apache Mahout Classic/Taste 0.13.0, rồi phát lại từng bước trên trình duyệt để người xem theo được: đọc CSV → ma trận → tương đồng Pearson → láng giềng → ứng viên → dự đoán → Top-2.

## Yêu cầu

| Thành phần | Bắt buộc? | Ghi chú |
|---|---|---|
| JDK 11 trở lên | Có | Kiểm tra: `java -version`. Đã thử trên Java 21. |
| PowerShell (Windows 10/11) | Có nếu dùng `START_DEMO.cmd` | Không có thì xem mục *Chạy thủ công* bên dưới. |
| Internet | Chỉ lần build đầu | Tải Maven + thư viện Maven. Sau khi có JAR thì chạy offline. |
| Node.js 18 trở lên | Chỉ khi muốn chạy test | Không cần để xem demo. |

Repo **không** chứa thư mục `target/` (JAR build ra) nên sau khi clone ai cũng tự build lại bằng lệnh ở dưới — không lo bản JAR cũ của người khác.

## Clone và chạy nhanh (Windows)

```powershell
git clone https://github.com/HoangThaNHty/Apache_Mahout_demo.git
cd Apache_Mahout_demo
START_DEMO.cmd
```

`START_DEMO.cmd` sẽ tự động: tải Apache Maven vào `.tools/` (lần đầu) → `mvn package` → chạy JAR → mở trình duyệt tại `http://localhost:8080`.

Ở trang demo bấm **▶ Chạy tự động từng bước** (hoặc **Xem và điều khiển từng bước** nếu muốn tự bấm).

Muốn build lại từ đầu (sửa code, hoặc build lạ):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File run-demo.ps1 -Rebuild
```

## Chạy thủ công (Windows / macOS / Linux)

Dùng cách này nếu đã cài Maven, hoặc không dùng được file `.cmd`:

```bash
git clone https://github.com/HoangThaNHty/Apache_Mahout_demo.git
cd Apache_Mahout_demo
mvn -DskipTests package
java -Dfile.encoding=UTF-8 -jar target/mahout-demo.jar --port 8080 --open
```

Mở `http://localhost:8080` (nếu bỏ `--open`). Server chỉ nghe trên `127.0.0.1`, tức là **chỉ máy bạn mở được** — muốn trình bày cho cả lớp thì chiếu màn hình, không truy cập từ máy khác qua IP.

Dừng server: đóng cửa sổ terminal hoặc `Ctrl+C`.

## Cấu trúc thư mục

```
Apache_Mahout_demo/
├── START_DEMO.cmd                  # Bấm đúp để chạy (Windows)
├── run-demo.ps1                    # Tự tải Maven, build, khởi động server
├── pom.xml                         # Maven: mahout-mr 0.13.0, shade thành 1 JAR
├── src/main/java/vn/edu/huit/mahoutdemo/App.java   # HTTP server + gọi Mahout
├── src/main/resources/
│   ├── demo/dataset-150.csv        # Dataset mẫu (15 người × 15 phim)
│   ├── demo/demo-ratings.csv       # CSV rating tham khảo (không dùng khi chạy)
│   ├── web/                        # Giao diện: index.html, app.js, styles.css
│   └── log4j.properties            # Tắt log Mahout
├── test-demo.cjs                   # Kiểm thử API + render (cần Node)
├── test-users.cjs                  # Kiểm thử độc lập Pearson/Top-N cả 15 người
├── LICENSE                         # MIT
└── .gitignore                      # Loại target/, .tools/, data/ ...
```

Thư mục `.tools/` (Maven, linkedom) và `target/` (JAR) được tạo tự động khi build, **không có trong repo**. Thư mục `data/` (nếu có trên máy bạn) chỉ là dữ liệu tham khảo local, demo không dùng tới.

## API

Server khởi động ở `http://localhost:8080` (đổi bằng `--port`):

| Endpoint | Mô tả |
|---|---|
| `GET /` | Giao diện demo (`/app.js`, `/styles.css` đi kèm) |
| `GET /health` | `{"status":"ok","engine":"Apache Mahout Classic/Taste 0.13.0"}` |
| `GET /api/demo/trace?userId=3` | Trả JSON kết quả Mahout tính cho người có id 3 |
| `GET /api/dataset` | Tải về `dataset-150.csv` |
| `POST /api/dataset?userId=3` | Nạp CSV tự sửa rồi tính lại (tối đa 200 KB) |

`userId` không tồn tại trả HTTP 400 kèm `{"error": "..."}`.

## Kiểm thử

Chạy **từ thư mục gốc của repo**, khi server đang mở ở `http://127.0.0.1:8080`:

```bash
# 1) một lần duy nhất: cài thư viện DOM kiểm thử
npm install --prefix .tools/dom-test --no-audit --no-fund linkedom

# 2) chạy test
node test-demo.cjs  http://127.0.0.1:8080
node test-users.cjs http://127.0.0.1:8080
```

Cả hai đều in `PASS` khi thành công. Port khác thì thay `8080` bằng port đó.

- `test-demo.cjs`: CSV, ma trận, Pearson, điểm dự đoán, upload dữ liệu tự sửa, dữ liệu lỗi, render 7 bước bằng DOM giả lập (không thay thế kiểm tra bằng mắt trên trình duyệt).
- `test-users.cjs`: đối chiếu độc lập Pearson, láng giềng, ứng viên, điểm và Top-N cho cả 15 người; chọn người khi đang chạy, phản hồi sai thứ tự, CSV tự nạp, kết quả rỗng.

`.tools/dom-test` chỉ phục vụ test — **không cần cho việc chạy demo**.

## Xử lý sự cố

| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| `Khong tim thay Java` | Chưa cài JDK hoặc chưa thêm `java` vào `PATH`. Cài JDK 11+, mở lại `START_DEMO.cmd`. |
| Lỗi mạng khi build lần đầu | Cần Internet để tải Maven + thư viện. Chạy lại, hoặc xoá `.tools/apache-maven-*` để tải lại Maven. |
| Build lại không nhận thay đổi | Dùng `powershell -File run-demo.ps1 -Rebuild`. |
| Port 8080 đã bị chiếm | `run-demo.ps1` tự dùng lại server đang chạy nếu `/health` còn tốt. Muốn server mới: đóng tiến trình cũ hoặc chạy `java -jar target/mahout-demo.jar --port 8090`. |
| `Cannot find module ... linkedom` | Chưa cài thư viện test: chạy lệnh `npm install --prefix .tools/dom-test ...` ở mục *Kiểm thử*. |
| Test báo sai / đọc nhầm file | Phải chạy `node test-*.cjs` từ thư mục gốc repo và server đang mở. |
| Không mở được từ máy khác | Đúng — server chỉ bind `127.0.0.1`. Hãy chiếu màn hình máy đang chạy demo. |
| Không thấy `data/ml-100k` sau khi clone | Có chủ đích: folder đó bị `.gitignore`, demo không dùng tới. |

## Dataset

`src/main/resources/demo/dataset-150.csv`: 150 lượt đánh giá tự tạo, 15 người (có An, Bình, Dũng), 15 phim. Không phải MovieLens hoặc dữ liệu khán giả thật. Có 75 ô chưa biết trong tổng số 225 ô; dataset nhằm giải thích thuật toán, không đại diện dữ liệu cực thưa ở quy mô lớn.

Website cho tải CSV mẫu, sửa điểm trong file rồi nạp lại bằng **Đọc dataset CSV**. Java/Mahout tính lại toàn bộ, không dùng kết quả cố định ở frontend.

Định dạng CSV: UTF-8, có header `userId,userName,movieId,movieName,rating`. Mỗi dòng đúng 5 cột, tên không chứa dấu phẩy hoặc xuống dòng (không hỗ trợ CSV có quoted fields). ID nguyên dương; mỗi ID gắn một tên; không trùng cặp người–phim; điểm 1–5. Bỏ hẳn dòng nếu chưa đánh giá, không nhập 0 hoặc ?. Giới hạn 200 KB, 3–30 người và tối đa 30 phim. Có thể chọn bất kỳ người nào; mặc định là ID 1 nếu có, nếu không sẽ chọn người đầu tiên trong CSV.

## Chọn người cần gợi ý

Chọn người ở màn hình giới thiệu hoặc thanh **Người cần gợi ý** phía trên vùng trình diễn. Xem số phim đã đánh giá/chưa có điểm rồi bấm **Chạy gợi ý cho [tên]**. Đổi người giữa lúc chạy sẽ dừng hoạt ảnh, tính lại và trở về bước 1; không tự chạy cho đến khi bạn bấm Chạy. Dataset CSV đã nạp được giữ nguyên khi đổi người. Chọn An, Minh hoặc Phúc để trình bày các trường hợp có Top-2; Bình/Dũng không còn ứng viên trong tập phim của láng giềng. Đây là kết quả đúng của bộ mẫu, không phải lỗi. Giao diện giải thích khi có ít hơn hai kết quả.

## Kịch bản trình bày

1. Đọc từng dòng: ai, phim nào, bao nhiêu sao.
2. Đưa rating vào ma trận; các ô còn ? là chưa đánh giá, không chắc là chưa xem.
3. Pearson: chỉ dùng phim chung, trừ trung bình từng người và so sánh độ lệch.
4. Chọn tối đa hai láng giềng có hệ số dương cao nhất.
5. Lấy phim của láng giềng, loại phim mục tiêu đã đánh giá.
6. Ước lượng điểm bằng tổng các tích similarity × rating, chia tổng similarity; cần ít nhất hai đóng góp hợp lệ.
7. Trả Top-2. Với bộ mẫu: Bình (1), Dũng (0,9); Interstellar (5), The Matrix (~4,5263).

Tự động mặc định 12 giây/bước (84 giây), có 6 hoặc 20 giây/bước. Space tạm dừng thật sự tiến trình hình ảnh. Mũi tên chuyển bước; bước thủ công hiện nội dung đã tính để tiện giải thích. Nhấn Tiếp tục để phát hoạt ảnh. Ở bước Pearson và dự đoán, bấm tên người/phim phía trên để xem riêng phép tính. R chạy lại, F toàn màn hình, O tổng quan.

## Tính chính xác và phạm vi

Java gọi Apache Mahout Classic/Taste 0.13.0: FileDataModel → PearsonCorrelationSimilarity → NearestNUserNeighborhood → GenericUserBasedRecommender. GET `/api/demo/trace?userId=3` trả kết quả cho người được chọn; POST `/api/dataset?userId=3` tính trên CSV tự nạp. ID không tồn tại trả lỗi 400. Kết quả được tính trước khi phát hoạt ảnh; đây là giải thích/phát lại các phép tính, không phải debugger theo dõi nội bộ Mahout trực tiếp. Ma trận HTML chỉ là cách biểu diễn, không phải một mảng đặc Mahout tự cấp phát. Chạy một máy; không phải Samsara, ALS hay benchmark MapReduce/Spark.

Đối chiếu công thức với [mã nguồn Apache Mahout 0.13.0](https://github.com/apache/mahout/blob/mahout-0.13.0/mr/src/main/java/org/apache/mahout/cf/taste/impl/recommender/GenericUserBasedRecommender.java).

## Giấy phép

MIT — xem [LICENSE](LICENSE).
