"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function BenchmarkViewer() {
  const params = useParams();
  const searchParams = useSearchParams();
  const userId = params.userId as string;
  const edgeIp = searchParams.get("edgeIp") || "10.119.207.216";

  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const res = await fetch(`http://${edgeIp}:8888/api/benchmarks/${userId}/files`);
        if (res.ok) {
          const data = await res.json();
          setFiles(data || []);
        } else {
          console.error("Failed to fetch files", await res.text());
        }
      } catch (err) {
        console.error("Error fetching files:", err);
      } finally {
        setLoading(false);
      }
    };
    if (userId) {
      fetchFiles();
    }
  }, [userId, edgeIp]);

  const handleFileClick = async (filename: string) => {
    setSelectedFile(filename);
    setFileContent(null);
    try {
      const res = await fetch(`http://${edgeIp}:8888/api/benchmarks/${userId}/download/${filename}`);
      if (res.ok) {
        // Assume text based files for now
        const text = await res.text();
        setFileContent(text);
      } else {
        setFileContent("Error: " + await res.text());
      }
    } catch (err) {
      setFileContent("Error fetching file content: " + String(err));
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto font-sans">
      <div className="mb-6 border-b pb-4">
        <Link href="/video-processing" className="text-blue-500 hover:underline mb-2 inline-block">
          &larr; Back to Benchmarks
        </Link>
        <h1 className="text-2xl font-bold">Benchmark Viewer: <span className="font-mono text-gray-700">{userId}</span></h1>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar for Files */}
        <div className="md:w-1/4">
          <h2 className="font-semibold text-lg mb-2">Files</h2>
          {loading ? (
            <p className="text-gray-500 text-sm">Loading files...</p>
          ) : files.length === 0 ? (
            <p className="text-gray-500 text-sm">No files found.</p>
          ) : (
            <ul className="space-y-1">
              {files.map((file) => (
                <li key={file}>
                  <button
                    onClick={() => handleFileClick(file)}
                    className={`w-full text-left px-3 py-2 text-sm rounded transition-colors ${
                      selectedFile === file
                        ? "bg-blue-100 text-blue-700 font-medium"
                        : "hover:bg-gray-100"
                    }`}
                  >
                    📄 {file}
                  </button>
                  <a
                    href={`http://${edgeIp}:8888/api/benchmarks/${userId}/download/${file}`}
                    target="_blank"
                    download
                    className="text-xs text-blue-500 hover:underline ml-3"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* File Content Viewer */}
        <div className="md:w-3/4">
          <h2 className="font-semibold text-lg mb-2">
            {selectedFile ? `Viewing: ${selectedFile}` : "Select a file to view"}
          </h2>
          <div className="border rounded-md min-h-[500px] bg-gray-50 overflow-auto">
            {!selectedFile && (
              <div className="flex items-center justify-center h-full min-h-[500px] text-gray-400">
                File contents will appear here
              </div>
            )}
            {selectedFile && fileContent === null && (
              <div className="flex items-center justify-center h-full min-h-[500px] text-gray-500">
                Loading content...
              </div>
            )}
            {selectedFile && fileContent !== null && (
              <pre className="p-4 text-xs font-mono whitespace-pre-wrap text-black">
                {fileContent}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
