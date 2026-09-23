package vn.edu.huit.mahoutdemo;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.apache.mahout.cf.taste.common.TasteException;
import org.apache.mahout.cf.taste.impl.common.LongPrimitiveIterator;
import org.apache.mahout.cf.taste.impl.model.file.FileDataModel;
import org.apache.mahout.cf.taste.impl.neighborhood.NearestNUserNeighborhood;
import org.apache.mahout.cf.taste.impl.recommender.GenericUserBasedRecommender;
import org.apache.mahout.cf.taste.impl.similarity.PearsonCorrelationSimilarity;
import org.apache.mahout.cf.taste.model.DataModel;
import org.apache.mahout.cf.taste.model.PreferenceArray;
import org.apache.mahout.cf.taste.neighborhood.UserNeighborhood;
import org.apache.mahout.cf.taste.recommender.RecommendedItem;
import org.apache.mahout.cf.taste.recommender.Recommender;
import org.apache.mahout.cf.taste.similarity.UserSimilarity;

import java.awt.Desktop;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Executors;

/** One-click visual explanation of Apache Mahout Classic/Taste. */
public final class App {
    private final Map<Long, String> USERS = new LinkedHashMap<>();
    private final Map<Long, String> MOVIES = new LinkedHashMap<>();

    private final DataModel model;
    private final UserSimilarity similarity;
    private final UserNeighborhood neighborhood;
    private final Recommender recommender;

    private App(String dataset) throws Exception {
        Path csv = Files.createTempFile("mahout-huit-small-", ".csv");
        csv.toFile().deleteOnExit();
        StringBuilder numeric = new StringBuilder();
        java.util.Set<String> pairs = new java.util.HashSet<>();
        for (String line : dataset.replace("\uFEFF", "").split("\\R")) {
            if (line.isBlank() || line.startsWith("userId,")) continue;
            String[] v = line.split(",", -1);
            if (v.length != 5) throw new IllegalArgumentException("CSV cần 5 cột: userId,userName,movieId,movieName,rating");
            long uid = Long.parseLong(v[0].trim()), mid = Long.parseLong(v[2].trim());
            float rating = Float.parseFloat(v[4].trim());
            if (uid <= 0 || mid <= 0 || !Float.isFinite(rating) || rating < 1 || rating > 5 || v[1].isBlank() || v[3].isBlank()) throw new IllegalArgumentException("ID phải dương, tên không trống và điểm từ 1 đến 5.");
            if (!pairs.add(uid + ":" + mid)) throw new IllegalArgumentException("Trùng cặp userId/movieId.");
            if (USERS.containsKey(uid) && !USERS.get(uid).equals(v[1].trim()) || MOVIES.containsKey(mid) && !MOVIES.get(mid).equals(v[3].trim())) throw new IllegalArgumentException("Một ID phải gắn với một tên duy nhất.");
            USERS.put(uid, v[1].trim()); MOVIES.put(mid, v[3].trim());
            numeric.append(uid).append(',').append(mid).append(',').append(rating).append('\n');
        }
        if (USERS.size() < 3 || USERS.size() > 30 || MOVIES.size() > 30) throw new IllegalArgumentException("Dataset cần 3–30 người và tối đa 30 phim.");
        Files.writeString(csv, numeric, StandardCharsets.UTF_8);
        model = new FileDataModel(csv.toFile());
        similarity = new PearsonCorrelationSimilarity(model);
        neighborhood = new NearestNUserNeighborhood(2, Double.MIN_VALUE, similarity, model);
        recommender = new GenericUserBasedRecommender(model, neighborhood, similarity);
        // FileDataModel may retain a handle on Windows; cleanup is registered with deleteOnExit.
    }

    public static void main(String[] args) throws Exception {
        Map<String, String> options = parseArgs(args);
        int port = Integer.parseInt(options.getOrDefault("port", "8080"));
        String dataset;
        try (InputStream in = App.class.getClassLoader().getResourceAsStream("demo/dataset-150.csv")) {
            dataset = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        App app = new App(dataset);

        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        server.createContext("/api/demo/trace", app::handleTrace);
        server.createContext("/health", app::handleHealth);
        server.createContext("/api/dataset", exchange -> {
            if ("GET".equals(exchange.getRequestMethod())) {
                byte[] body = dataset.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "text/csv; charset=utf-8");
                exchange.getResponseHeaders().set("Content-Disposition", "attachment; filename=dataset-150.csv");
                exchange.sendResponseHeaders(200, body.length); exchange.getResponseBody().write(body); exchange.close(); return;
            }
            if (!"POST".equals(exchange.getRequestMethod())) { sendJson(exchange,405,"{\"error\":\"Chỉ hỗ trợ GET/POST\"}"); return; }
            try {
                byte[] body = exchange.getRequestBody().readNBytes(200001);
                if (body.length > 200000) throw new IllegalArgumentException("CSV tối đa 200 KB.");
                App uploaded = new App(new String(body,StandardCharsets.UTF_8));
                sendJson(exchange,200,uploaded.buildTraceJson(uploaded.requestedUser(exchange)));
            } catch (Exception ex) { sendJson(exchange,400,"{\"error\":" + quote("Không đọc được dataset: " + ex.getMessage()) + "}"); }
        });
        server.createContext("/", app::handleStatic);
        server.setExecutor(Executors.newFixedThreadPool(Math.max(4,
            Runtime.getRuntime().availableProcessors())));
        server.start();

        String url = "http://localhost:" + port;
        System.out.println("Apache Mahout dataset demo ready.");
        System.out.println("Open demo: " + url);
        Runtime.getRuntime().addShutdownHook(new Thread(() -> server.stop(0)));
        if (options.containsKey("open")) openBrowser(url);
    }

    private void handleHealth(HttpExchange exchange) throws IOException {
        sendJson(exchange, 200, "{\"status\":\"ok\",\"engine\":\"Apache Mahout Classic/Taste 0.13.0\"}");
    }

    private void handleTrace(HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) {
            sendJson(exchange, 405, "{\"error\":\"Chỉ hỗ trợ GET\"}");
            return;
        }
        try { sendJson(exchange, 200, buildTraceJson(requestedUser(exchange))); }
        catch (Exception ex) { sendJson(exchange, 400, "{\"error\":" + quote(ex.getMessage()) + "}"); }
    }

    private long requestedUser(HttpExchange exchange) {
        String query = exchange.getRequestURI().getRawQuery();
        if (query != null) for (String part : query.split("&")) {
            String[] pair = part.split("=", 2);
            if ("userId".equals(pair[0])) {
                if (pair.length != 2) throw new IllegalArgumentException("Thiếu userId.");
                long id = Long.parseLong(java.net.URLDecoder.decode(pair[1], StandardCharsets.UTF_8));
                if (!USERS.containsKey(id)) throw new IllegalArgumentException("Người dùng không có trong dataset.");
                return id;
            }
        }
        return USERS.containsKey(1L) ? 1L : USERS.keySet().iterator().next();
    }

    private String buildTraceJson(long targetUser) throws TasteException {
        long[] neighbors = neighborhood.getUserNeighborhood(targetUser);
        List<RecommendedItem> recommendations = recommender.recommend(targetUser, MOVIES.size());
        Map<Long, Float> scores = new LinkedHashMap<>();
        for (RecommendedItem item : recommendations) scores.put(item.getItemID(), item.getValue());

        StringBuilder json = new StringBuilder(12000).append('{');
        field(json, "engine", "Apache Mahout Classic/Taste 0.13.0").append(',');
        field(json, "dataset", "Dataset minh họa do nhóm tạo / CSV đã nạp").append(',');
        field(json, "generatedAt", Instant.now().toString()).append(',');
        json.append("\"targetUser\":{\"id\":").append(targetUser).append(",\"name\":").append(quote(USERS.get(targetUser))).append("},");

        json.append("\"users\":[");
        appendNamedEntities(json, USERS);
        json.append("],\"movies\":[");
        appendNamedEntities(json, MOVIES);
        json.append("],\"ratings\":[");
        boolean first = true;
        LongPrimitiveIterator userIds = model.getUserIDs();
        while (userIds.hasNext()) {
            long userId = userIds.nextLong();
            PreferenceArray prefs = model.getPreferencesFromUser(userId);
            for (int i = 0; i < prefs.length(); i++) {
                if (!first) json.append(',');
                first = false;
                json.append("{\"userId\":").append(userId)
                    .append(",\"user\":").append(quote(USERS.get(userId)))
                    .append(",\"movieId\":").append(prefs.getItemID(i))
                    .append(",\"movie\":").append(quote(MOVIES.get(prefs.getItemID(i))))
                    .append(",\"rating\":").append(format(prefs.getValue(i))).append('}');
            }
        }

        json.append("],\"matrix\":[");
        first = true;
        for (long userId : USERS.keySet()) {
            if (!first) json.append(',');
            first = false;
            json.append("{\"userId\":").append(userId)
                .append(",\"user\":").append(quote(USERS.get(userId))).append(",\"values\":[");
            boolean firstMovie = true;
            for (long movieId : MOVIES.keySet()) {
                if (!firstMovie) json.append(',');
                firstMovie = false;
                Float value = model.getPreferenceValue(userId, movieId);
                json.append(value == null ? "null" : format(value));
            }
            json.append("]}");
        }

        json.append("],\"similarities\":[");
        first = true;
        for (long userId : USERS.keySet()) {
            if (userId == targetUser) continue;
            if (!first) json.append(',');
            first = false;
            double value = similarity.userSimilarity(targetUser, userId);
            json.append("{\"userId\":").append(userId)
                .append(",\"user\":").append(quote(USERS.get(userId)))
                .append(",\"value\":").append(format(value))
                .append(",\"selected\":").append(contains(neighbors, userId)).append('}');
        }

        json.append("],\"neighbors\":[");
        for (int i = 0; i < neighbors.length; i++) {
            if (i > 0) json.append(',');
            long userId = neighbors[i];
            json.append("{\"userId\":").append(userId)
                .append(",\"user\":").append(quote(USERS.get(userId)))
                .append(",\"similarity\":").append(format(similarity.userSimilarity(targetUser, userId))).append('}');
        }

        json.append("],\"candidates\":[");
        java.util.Set<Long> candidateSet = new java.util.TreeSet<>();
        for (long neighbor : neighbors) {
            PreferenceArray p = model.getPreferencesFromUser(neighbor);
            for (int i=0;i<p.length();i++) if(model.getPreferenceValue(targetUser,p.getItemID(i)) == null) candidateSet.add(p.getItemID(i));
        }
        long[] candidateIds = candidateSet.stream().mapToLong(Long::longValue).toArray();
        for (int c = 0; c < candidateIds.length; c++) {
            if (c > 0) json.append(',');
            long movieId = candidateIds[c];
            json.append("{\"movieId\":").append(movieId)
                .append(",\"movie\":").append(quote(MOVIES.get(movieId)))
                .append(",\"contributions\":[");
            double numerator = 0;
            double denominator = 0;
            boolean firstContribution = true;
            for (int i = 0; i < neighbors.length; i++) {
                long neighborId = neighbors[i];
                Float observed = model.getPreferenceValue(neighborId, movieId);
                if (observed == null) continue;
                if (!firstContribution) json.append(','); firstContribution = false;
                double sim = similarity.userSimilarity(targetUser, neighborId);
                float rating = observed;
                double product = sim * rating;
                numerator += product;
                denominator += sim;
                json.append("{\"userId\":").append(neighborId)
                    .append(",\"user\":").append(quote(USERS.get(neighborId)))
                    .append(",\"similarity\":").append(format(sim))
                    .append(",\"rating\":").append(format(rating))
                    .append(",\"weighted\":").append(format(product)).append('}');
            }
            float prediction = recommender.estimatePreference(targetUser, movieId);
            json.append("],\"numerator\":").append(format(numerator))
                .append(",\"denominator\":").append(format(denominator))
                .append(",\"prediction\":").append(format(prediction)).append('}');
        }

        json.append("],\"topN\":[");
        for (int i = 0; i < Math.min(2, recommendations.size()); i++) {
            if (i > 0) json.append(',');
            RecommendedItem item = recommendations.get(i);
            json.append("{\"rank\":").append(i + 1)
                .append(",\"movieId\":").append(item.getItemID())
                .append(",\"movie\":").append(quote(MOVIES.get(item.getItemID())))
                .append(",\"score\":").append(format(item.getValue())).append('}');
        }
        json.append("],\"pipeline\":[\"Dữ liệu\",\"Ma trận\",\"Tương đồng\",\"Láng giềng\",\"Ứng viên\",\"Dự đoán\",\"Top-N\"]}");
        return json.toString();
    }

    private void handleStatic(HttpExchange exchange) throws IOException {
        String requestPath = exchange.getRequestURI().getPath();
        if ("/".equals(requestPath)) requestPath = "/index.html";
        if (requestPath.contains("..")) {
            sendJson(exchange, 400, "{\"error\":\"Đường dẫn không hợp lệ\"}");
            return;
        }
        try (InputStream input = App.class.getClassLoader().getResourceAsStream("web" + requestPath)) {
            if (input == null) {
                sendJson(exchange, 404, "{\"error\":\"Không tìm thấy tài nguyên\"}");
                return;
            }
            byte[] body = input.readAllBytes();
            exchange.getResponseHeaders().set("Content-Type", mimeType(requestPath));
            exchange.getResponseHeaders().set("Cache-Control", "no-cache");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        }
    }

    private static void appendNamedEntities(StringBuilder json, Map<Long, String> entries) {
        boolean first = true;
        for (Map.Entry<Long, String> entry : entries.entrySet()) {
            if (!first) json.append(',');
            first = false;
            json.append("{\"id\":").append(entry.getKey()).append(",\"name\":")
                .append(quote(entry.getValue())).append('}');
        }
    }

    private static boolean contains(long[] values, long target) {
        for (long value : values) if (value == target) return true;
        return false;
    }

    private static StringBuilder field(StringBuilder json, String name, String value) {
        return json.append(quote(name)).append(':').append(quote(value));
    }

    private static String format(double value) {
        if (!Double.isFinite(value)) return "null";
        return String.format(Locale.US, "%.6f", value);
    }

    private static String quote(String value) {
        StringBuilder out = new StringBuilder(value.length() + 8).append('"');
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '"' || c == '\\') out.append('\\').append(c);
            else if (c == '\n') out.append("\\n");
            else if (c == '\r') out.append("\\r");
            else if (c == '\t') out.append("\\t");
            else out.append(c);
        }
        return out.append('"').toString();
    }

    private static String mimeType(String path) {
        if (path.endsWith(".css")) return "text/css; charset=utf-8";
        if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
        if (path.endsWith(".svg")) return "image/svg+xml";
        return "text/html; charset=utf-8";
    }

    private static void sendJson(HttpExchange exchange, int status, String json) throws IOException {
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }

    private static void openBrowser(String url) {
        try {
            if (Desktop.isDesktopSupported()) Desktop.getDesktop().browse(URI.create(url));
        } catch (Exception ignored) {
            System.out.println("Open the browser manually at " + url);
        }
    }

    private static Map<String, String> parseArgs(String[] args) {
        Map<String, String> result = new HashMap<>();
        for (int i = 0; i < args.length; i++) {
            if (!args[i].startsWith("--")) continue;
            String key = args[i].substring(2);
            String value = i + 1 < args.length && !args[i + 1].startsWith("--") ? args[++i] : "true";
            result.put(key, value);
        }
        return result;
    }

    private static <K, V> Map<K, V> linkedMap(Object... values) {
        Map<K, V> result = new LinkedHashMap<>();
        for (int i = 0; i < values.length; i += 2) {
            @SuppressWarnings("unchecked") K key = (K) values[i];
            @SuppressWarnings("unchecked") V value = (V) values[i + 1];
            result.put(key, value);
        }
        return result;
    }
}
