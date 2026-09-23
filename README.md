# Demo Apache Mahout — đọc CSV và minh họa thuật toán

Nhấn đúp `START_DEMO.cmd`, sau đó chọn **Chạy tự động từng bước**. Java 11+ cần có trên máy. JAR đóng gói chạy offline; lần build đầu tiên cần Internet.

## Dataset

`src/main/resources/demo/dataset-150.csv`: 150 lượt đánh giá tự tạo, 15 người (có An, Bình, Dũng), 15 phim. Không phải MovieLens hoặc dữ liệu khán giả thật. Có 75 ô chưa biết trong tổng số 225 ô; dataset nhằm giải thích thuật toán, không đại diện dữ liệu cực thưa ở quy mô lớn.

Website cho tải CSV mẫu, sửa điểm trong file rồi nạp lại bằng **Đọc dataset CSV**. Java/Mahout tính lại toàn bộ, không dùng kết quả cố định ở frontend.

## Chọn người cần gợi ý

Chọn người ở màn hình giới thiệu hoặc thanh **Người cần gợi ý** phía trên vùng trình diễn. Xem số phim đã đánh giá/chưa có điểm rồi bấm **Chạy gợi ý cho [tên]**. Đổi người giữa lúc chạy sẽ dừng hoạt ảnh, tính lại và trở về bước 1; không tự chạy cho đến khi bạn bấm Chạy. Dataset CSV đã nạp được giữ nguyên khi đổi người. Chọn An, Minh hoặc Phúc để trình bày các trường hợp có Top-2; Bình/Dũng không còn ứng viên trong tập phim của láng giềng. Đây là kết quả đúng của bộ mẫu, không phải lỗi. Giao diện giải thích khi có ít hơn hai kết quả.

CSV UTF-8, có header `userId,userName,movieId,movieName,rating`. Mỗi dòng đúng 5 cột, tên không chứa dấu phẩy hoặc xuống dòng (không hỗ trợ CSV có quoted fields). ID nguyên dương; mỗi ID gắn một tên; không trùng cặp người–phim; điểm 1–5. Bỏ hẳn dòng nếu chưa đánh giá, không nhập 0 hoặc ?. Giới hạn 200 KB, 3–30 người và tối đa 30 phim. Có thể chọn bất kỳ người nào; mặc định là ID 1 nếu có, nếu không sẽ chọn người đầu tiên trong CSV.

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

Kiểm thử chọn người: `node test-users.cjs http://127.0.0.1:8080`. Đối chiếu độc lập Pearson, láng giềng, ứng viên, điểm và Top-N cho cả 15 người; kiểm tra chọn người khi đang chạy, phản hồi đến sai thứ tự, CSV tự nạp và kết quả rỗng.

Đối chiếu công thức với [mã nguồn Apache Mahout 0.13.0](https://github.com/apache/mahout/blob/mahout-0.13.0/mr/src/main/java/org/apache/mahout/cf/taste/impl/recommender/GenericUserBasedRecommender.java).

Kiểm thử: cài thư viện DOM kiểm thử (bắt buộc cho cả `test-demo.cjs` và `test-users.cjs`) bằng `npm install --prefix .tools/dom-test --no-audit --no-fund linkedom`, sau đó chạy `node test-demo.cjs http://127.0.0.1:8080` và `node test-users.cjs http://127.0.0.1:8080` khi server đang mở. Test kiểm tra CSV, ma trận, Pearson, điểm dự đoán, upload sửa dữ liệu, dữ liệu lỗi và render logic bảy bước bằng DOM giả lập (không thay thế kiểm tra hình ảnh trình duyệt). Có kiểm tra giữ nguyên vùng cuộn ma trận và thẻ Top-2 qua các frame; thư viện kiểm thử không cần thiết để chạy demo.
