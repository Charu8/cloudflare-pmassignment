// Mock data for local development fallback
const mockItems = [
	{
		id: "1",
		source: "Support Ticket",
		text: "The dashboard is failing to load when I try to view analytics data for the past hour.",
		timestamp: "2025-01-23T20:00:00.000Z",
		urgency: "high",
		sentiment: "negative",
		theme: "performance",
		summary: "Dashboard performance issues with analytics loading"
	},
	{
		id: "2",
		source: "Twitter/X",
		text: "Just discovered your product and I'm loving it! The UI is so intuitive and clean.",
		timestamp: "2025-01-23T20:01:00.000Z",
		urgency: "low",
		sentiment: "positive",
		theme: "UI",
		summary: "Positive feedback on UI design and intuitiveness"
	},
	{
		id: "3",
		source: "GitHub Issue",
		text: "Bug: The export functionality fails when trying to download CSV files with special characters.",
		timestamp: "2025-01-23T20:02:00.000Z",
		urgency: "medium",
		sentiment: "negative",
		theme: "bug",
		summary: "CSV export fails with special characters"
	},
	{
		id: "4",
		source: "Community Forum",
		text: "Would be great to have dark mode support. My eyes get tired during late night coding sessions.",
		timestamp: "2025-01-23T20:03:00.000Z",
		urgency: "low",
		sentiment: "neutral",
		theme: "feature",
		summary: "Request for dark mode feature"
	}
];

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		
		if (url.pathname === '/api/store' && request.method === 'POST') {
			try {
				// Check if database already has data
				const existingResult = await env.feedback_db.prepare(`
					SELECT COUNT(*) as count FROM feedback
				`).first();
				
				if (existingResult && existingResult.count > 0) {
					return Response.json({
						message: "Database already seeded",
						existingItems: existingResult.count
					});
				}
				
				const feedback = [
					{
						source: "Support Ticket",
						text: "The dashboard is failing to load when I try to view analytics data for the past hour."
					},
					{
						source: "Twitter/X",
						text: "Just discovered your product and I'm loving it! The UI is so intuitive and clean."
					},
					{
						source: "GitHub Issue", 
						text: "Bug: The export functionality fails when trying to download CSV files with special characters."
					},
					{
						source: "Community Forum",
						text: "Would be great to have dark mode support. My eyes get tired during late night coding sessions."
					}
				];

				// Create table if not exists
				await env.feedback_db.prepare(`
					CREATE TABLE IF NOT EXISTS feedback (
						id TEXT PRIMARY KEY,
						source TEXT NOT NULL,
						text TEXT NOT NULL,
						timestamp TEXT NOT NULL,
						urgency TEXT NOT NULL,
						sentiment TEXT NOT NULL,
						theme TEXT NOT NULL,
						summary TEXT NOT NULL
					)
				`).run();

				const items = await Promise.all(feedback.map(async (feedbackItem) => {
					const prompt = `Analyze this feedback: "${feedbackItem.text}". 

Return ONLY a JSON object with these exact keys:
{
  "urgency": "low|medium|high",
  "sentiment": "positive|negative|neutral", 
  "theme": "one-word-theme",
  "summary": "brief summary"
}

Example: {"urgency": "high", "sentiment": "negative", "theme": "performance", "summary": "Slow loading issue"}`;
					
					const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
						messages: [{ role: "user", content: prompt }]
					});
					
					console.log("AI Response:", response);
					
					let analysis;
					try {
						// Try to parse the response directly
						analysis = JSON.parse(response.response);
					} catch (e) {
						console.log("JSON Parse Error:", e.message);
						console.log("Raw Response:", response.response);
						
						// Try to extract JSON from the response if it contains extra text
						const jsonMatch = response.response.match(/\{[^}]+\}/);
						if (jsonMatch) {
							try {
								analysis = JSON.parse(jsonMatch[0]);
							} catch (e2) {
								console.log("Extracted JSON also failed");
								analysis = null;
							}
						} else {
							analysis = null;
						}
						
						// If still no valid analysis, use fallback
						if (!analysis) {
							analysis = {
								urgency: "medium",
								sentiment: "neutral", 
								theme: "general",
								summary: "Analysis failed - could not parse AI response"
							};
						}
					}
					
					const id = crypto.randomUUID();
					const timestamp = new Date().toISOString();
					
					const item = {
						id,
						source: feedbackItem.source,
						text: feedbackItem.text,
						timestamp,
						...analysis
					};
					
					// Store in D1
					await env.feedback_db.prepare(`
						INSERT INTO feedback (id, source, text, timestamp, urgency, sentiment, theme, summary)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?)
					`).bind(id, feedbackItem.source, feedbackItem.text, timestamp, analysis.urgency, analysis.sentiment, analysis.theme, analysis.summary).run();
					
					return id;
				}));
				
				return Response.json({
					message: "Database seeded successfully",
					count: items.length
				});
			} catch (error) {
				return Response.json({ error: error.message }, { status: 400 });
			}
		}

		if (url.pathname === '/api/items' && request.method === 'GET') {
			try {
				// Try to get from D1 first
				const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
				const result = await env.feedback_db.prepare(`
					SELECT id, source, text, timestamp, urgency, sentiment, theme, summary 
					FROM feedback 
					WHERE date(timestamp) = date(?)
					ORDER BY timestamp DESC
				`).bind(today).all();
				
				let items = result.results || [];
				
				// Fallback to mock data if D1 is empty
				if (items.length === 0) {
					items = mockItems;
				}
				
				return Response.json({
					message: "Items retrieved successfully from D1",
					items
				});
			} catch (error) {
				console.log("D1 Error:", error.message);
				// If D1 fails, fallback to mock data
				return Response.json({
					message: "Items retrieved successfully (fallback)",
					items: mockItems,
					error: error.message
				});
			}
		}

		if (url.pathname === '/api/analyze') {
			const feedback = [
				{
					id: "1",
					source: "Support Ticket",
					text: "The dashboard is failing to load when I try to view analytics data for the past hour."
				},
				{
					id: "2", 
					source: "Twitter/X",
					text: "Just discovered your product and I'm loving it! The UI is so intuitive and clean."
				},
				{
					id: "3",
					source: "GitHub Issue", 
					text: "Bug: The export functionality fails when trying to download CSV files with special characters."
				},
				{
					id: "4",
					source: "Community Forum",
					text: "Would be great to have dark mode support. My eyes get tired during late night coding sessions."
				}
			];

			const analyses = await Promise.all(feedback.map(async (item) => {
				const prompt = `Analyze this feedback: "${item.text}". Return JSON with: urgency (low/medium/high), sentiment (positive/negative/neutral), theme (one word), summary (brief)`;
				
				const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
					messages: [{ role: "user", content: prompt }]
				});
				
				try {
					const result = JSON.parse(response.response);
					return {
						id: item.id,
						source: item.source,
						text: item.text,
						...result
					};
				} catch (e) {
					return {
						id: item.id,
						source: item.source,
						text: item.text,
						urgency: "medium",
						sentiment: "neutral", 
						theme: "general",
						summary: "Analysis failed"
					};
				}
			}));

			return Response.json({
				message: "Feedback Analysis",
				analyses
			});
		}

		if (url.pathname === '/api/digest' && request.method === 'GET') {
			try {
				// Try to get from D1 first
				const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
				const result = await env.feedback_db.prepare(`
					SELECT id, source, text, timestamp, urgency, sentiment, theme, summary 
					FROM feedback 
					WHERE date(timestamp) = date(?)
					ORDER BY timestamp DESC
				`).bind(today).all();
				
				let items = result.results || [];
				
				// Fallback to mock data if D1 is empty
				if (items.length === 0) {
					items = mockItems;
				}
				
				const urgent = items.filter(item => item.urgency === 'high');
				
				const themeCounts = {};
				items.forEach(item => {
					themeCounts[item.theme] = (themeCounts[item.theme] || 0) + 1;
				});
				
				const topThemes = Object.entries(themeCounts)
					.sort(([,a], [,b]) => b - a)
					.slice(0, 5)
					.map(([theme, count]) => ({ theme, count }));
				
				return Response.json({
					date: new Date().toISOString(),
					urgent,
					topThemes,
					total: items.length
				});
			} catch (error) {
				// If D1 fails, fallback to mock data
				const urgent = mockItems.filter(item => item.urgency === 'high');
				
				const themeCounts = {};
				mockItems.forEach(item => {
					themeCounts[item.theme] = (themeCounts[item.theme] || 0) + 1;
				});
				
				const topThemes = Object.entries(themeCounts)
					.sort(([,a], [,b]) => b - a)
					.slice(0, 5)
					.map(([theme, count]) => ({ theme, count }));
				
				return Response.json({
					date: new Date().toISOString(),
					urgent,
					topThemes,
					total: mockItems.length
				});
			}
		}

		if (url.pathname === '/digest' && request.method === 'GET') {
			try {
				// Try to get from D1 first
				const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
				const result = await env.feedback_db.prepare(`
					SELECT id, source, text, timestamp, urgency, sentiment, theme, summary 
					FROM feedback 
					WHERE date(timestamp) = date(?)
					ORDER BY timestamp DESC
				`).bind(today).all();
				
				let items = result.results || [];
				
				// Fallback to mock data if D1 is empty
				if (items.length === 0) {
					items = mockItems;
				}
				
				const urgent = items.filter(item => item.urgency === 'high');
				
				const themeCounts = {};
				items.forEach(item => {
					themeCounts[item.theme] = (themeCounts[item.theme] || 0) + 1;
				});
				
				const topThemes = Object.entries(themeCounts)
					.sort(([,a], [,b]) => b - a)
					.slice(0, 5)
					.map(([theme, count]) => ({ theme, count }));
				
			const html = `
<!DOCTYPE html>
<html>
<head>
	<title>Daily Feedback Summary</title>
	<style>
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			max-width: 900px;
			margin: 0 auto;
			padding: 20px;
			line-height: 1.6;
			color: #333;
			background: #f8f9fa;
		}
		.header {
			background: white;
			padding: 30px;
			border-radius: 12px;
			box-shadow: 0 2px 10px rgba(0,0,0,0.1);
			margin-bottom: 30px;
			text-align: center;
		}
		h1 {
			color: #2c3e50;
			margin: 0 0 10px 0;
			font-size: 2.2em;
		}
		.datetime {
			color: #7f8c8d;
			font-size: 14px;
			margin-bottom: 10px;
		}
		.stats-bar {
			display: flex;
			justify-content: space-around;
			background: white;
			padding: 20px;
			border-radius: 12px;
			box-shadow: 0 2px 10px rgba(0,0,0,0.1);
			margin-bottom: 30px;
		}
		.stat-item {
			text-align: center;
		}
		.stat-number {
			font-size: 2em;
			font-weight: bold;
			color: #3498db;
			display: block;
		}
		.stat-label {
			color: #7f8c8d;
			font-size: 12px;
			text-transform: uppercase;
			letter-spacing: 1px;
		}
		section {
			background: white;
			padding: 25px;
			border-radius: 12px;
			box-shadow: 0 2px 10px rgba(0,0,0,0.1);
			margin-bottom: 30px;
		}
		h2 {
			color: #34495e;
			margin: 0 0 20px 0;
			font-size: 1.4em;
			border-bottom: 2px solid #ecf0f1;
			padding-bottom: 10px;
		}
		.urgent-item {
			background: #fff5f5;
			border-left: 4px solid #e74c3c;
			padding: 20px;
			margin-bottom: 15px;
			border-radius: 8px;
			box-shadow: 0 1px 3px rgba(0,0,0,0.1);
		}
		.urgent-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 10px;
		}
		.urgent-source {
			font-weight: bold;
			color: #c0392b;
			background: #ffe5e5;
			padding: 4px 8px;
			border-radius: 4px;
			font-size: 12px;
		}
		.urgent-time {
			color: #7f8c8d;
			font-size: 12px;
		}
		.urgent-text {
			color: #2c3e50;
			font-size: 14px;
			line-height: 1.5;
		}
		.theme-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
			gap: 15px;
		}
		.theme-card {
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			color: white;
			padding: 20px;
			border-radius: 12px;
			text-align: center;
			box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
			transition: transform 0.2s ease;
		}
		.theme-card:hover {
			transform: translateY(-2px);
		}
		.theme-name {
			font-size: 1.2em;
			font-weight: bold;
			margin-bottom: 8px;
			text-transform: capitalize;
		}
		.theme-count {
			font-size: 2em;
			font-weight: bold;
		}
		.theme-label {
			font-size: 12px;
			opacity: 0.9;
			text-transform: uppercase;
			letter-spacing: 1px;
		}
		.no-data {
			color: #7f8c8d;
			font-style: italic;
			text-align: center;
			padding: 40px;
			background: #f8f9fa;
			border-radius: 8px;
		}
		.priority-indicator {
			display: inline-block;
			width: 8px;
			height: 8px;
			border-radius: 50%;
			margin-right: 8px;
		}
		.priority-high { background: #e74c3c; }
		.priority-medium { background: #f39c12; }
		.priority-low { background: #27ae60; }
		.summary-box {
			background: #e8f4fd;
			border-left: 4px solid #3498db;
			padding: 15px;
			margin-top: 10px;
			border-radius: 4px;
			font-style: italic;
			color: #2c3e50;
		}
	</style>
</head>
<body>
	<div class="header">
		<h1>Daily Feedback Summary</h1>
		<div class="datetime">Generated: ${new Date().toLocaleString()}</div>
	</div>
	
	<div class="stats-bar">
		<div class="stat-item">
			<span class="stat-number">${items.length}</span>
			<span class="stat-label">Total Feedback</span>
		</div>
		<div class="stat-item">
			<span class="stat-number">${urgent.length}</span>
			<span class="stat-label">Urgent Items</span>
		</div>
		<div class="stat-item">
			<span class="stat-number">${topThemes.length}</span>
			<span class="stat-label">Top Themes</span>
		</div>
	</div>
	
	<section>
		<h2>Urgent Feedback</h2>
		${urgent.length > 0 ? urgent.map(item => `
			<div class="urgent-item">
				<div class="urgent-header">
					<div>
						<span class="urgent-source">${item.source}</span>
						<span class="priority-indicator priority-high"></span>
					</div>
					<div class="urgent-time">${new Date(item.timestamp).toLocaleDateString()}</div>
				</div>
				<div class="urgent-text">${item.text}</div>
				<div class="summary-box">
					<strong>Summary:</strong> ${item.summary}
				</div>
			</div>
		`).join('') : '<div class="no-data">No urgent items - great job!</div>'}
	</section>
	
	<section>
		<h2>Top Themes</h2>
		${topThemes.length > 0 ? `
			<div class="theme-grid">
				${topThemes.map(({theme, count}) => `
					<div class="theme-card">
						<div class="theme-name">${theme}</div>
						<div class="theme-count">${count}</div>
						<div class="theme-label">Mentions</div>
					</div>
				`).join('')}
			</div>
		` : '<div class="no-data">No themes identified</div>'}
	</section>
</body>
</html>`;
			
			return new Response(html, {
				headers: { 'Content-Type': 'text/html' }
			});
		} catch (error) {
			// If D1 fails, fallback to mock data for HTML digest
			const urgent = mockItems.filter(item => item.urgency === 'high');
			
			const themeCounts = {};
			mockItems.forEach(item => {
				themeCounts[item.theme] = (themeCounts[item.theme] || 0) + 1;
			});
			
			const topThemes = Object.entries(themeCounts)
				.sort(([,a], [,b]) => b - a)
				.slice(0, 5)
				.map(([theme, count]) => ({ theme, count }));
				
			const html = `
<!DOCTYPE html>
<html>
<head>
	<title>Daily Feedback Summary</title>
	<style>
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			max-width: 900px;
			margin: 0 auto;
			padding: 20px;
			line-height: 1.6;
			color: #333;
			background: #f8f9fa;
		}
		.header {
			background: white;
			padding: 30px;
			border-radius: 12px;
			box-shadow: 0 2px 10px rgba(0,0,0,0.1);
			margin-bottom: 30px;
			text-align: center;
		}
		h1 {
			color: #2c3e50;
			margin: 0 0 10px 0;
			font-size: 2.2em;
		}
		.datetime {
			color: #7f8c8d;
			font-size: 14px;
			margin-bottom: 10px;
		}
		.stats-bar {
			display: flex;
			justify-content: space-around;
			background: white;
			padding: 20px;
			border-radius: 12px;
			box-shadow: 0 2px 10px rgba(0,0,0,0.1);
			margin-bottom: 30px;
		}
		.stat-item {
			text-align: center;
		}
		.stat-number {
			font-size: 2em;
			font-weight: bold;
			color: #3498db;
			display: block;
		}
		.stat-label {
			color: #7f8c8d;
			font-size: 12px;
			text-transform: uppercase;
			letter-spacing: 1px;
		}
		section {
			background: white;
			padding: 25px;
			border-radius: 12px;
			box-shadow: 0 2px 10px rgba(0,0,0,0.1);
			margin-bottom: 30px;
		}
		h2 {
			color: #34495e;
			margin: 0 0 20px 0;
			font-size: 1.4em;
			border-bottom: 2px solid #ecf0f1;
			padding-bottom: 10px;
		}
		.urgent-item {
			background: #fff5f5;
			border-left: 4px solid #e74c3c;
			padding: 20px;
			margin-bottom: 15px;
			border-radius: 8px;
			box-shadow: 0 1px 3px rgba(0,0,0,0.1);
		}
		.urgent-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin-bottom: 10px;
		}
		.urgent-source {
			font-weight: bold;
			color: #c0392b;
			background: #ffe5e5;
			padding: 4px 8px;
			border-radius: 4px;
			font-size: 12px;
		}
		.urgent-time {
			color: #7f8c8d;
			font-size: 12px;
		}
		.urgent-text {
			color: #2c3e50;
			font-size: 14px;
			line-height: 1.5;
		}
		.theme-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
			gap: 15px;
		}
		.theme-card {
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			color: white;
			padding: 20px;
			border-radius: 12px;
			text-align: center;
			box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
			transition: transform 0.2s ease;
		}
		.theme-card:hover {
			transform: translateY(-2px);
		}
		.theme-name {
			font-size: 1.2em;
			font-weight: bold;
			margin-bottom: 8px;
			text-transform: capitalize;
		}
		.theme-count {
			font-size: 2em;
			font-weight: bold;
		}
		.theme-label {
			font-size: 12px;
			opacity: 0.9;
			text-transform: uppercase;
			letter-spacing: 1px;
		}
		.no-data {
			color: #7f8c8d;
			font-style: italic;
			text-align: center;
			padding: 40px;
			background: #f8f9fa;
			border-radius: 8px;
		}
		.priority-indicator {
			display: inline-block;
			width: 8px;
			height: 8px;
			border-radius: 50%;
			margin-right: 8px;
		}
		.priority-high { background: #e74c3c; }
		.priority-medium { background: #f39c12; }
		.priority-low { background: #27ae60; }
		.summary-box {
			background: #e8f4fd;
			border-left: 4px solid #3498db;
			padding: 15px;
			margin-top: 10px;
			border-radius: 4px;
			font-style: italic;
			color: #2c3e50;
		}
	</style>
</head>
<body>
	<div class="header">
		<h1>Daily Feedback Summary</h1>
		<div class="datetime">Generated: ${new Date().toLocaleString()}</div>
	</div>
	
	<div class="stats-bar">
		<div class="stat-item">
			<span class="stat-number">${items.length}</span>
			<span class="stat-label">Total Feedback</span>
		</div>
		<div class="stat-item">
			<span class="stat-number">${urgent.length}</span>
			<span class="stat-label">Urgent Items</span>
		</div>
		<div class="stat-item">
			<span class="stat-number">${topThemes.length}</span>
			<span class="stat-label">Top Themes</span>
		</div>
	</div>
	
	<section>
		<h2>Urgent Feedback</h2>
		${urgent.length > 0 ? urgent.map(item => `
			<div class="urgent-item">
				<div class="urgent-header">
					<div>
						<span class="urgent-source">${item.source}</span>
						<span class="priority-indicator priority-high"></span>
					</div>
					<div class="urgent-time">${new Date(item.timestamp).toLocaleDateString()}</div>
				</div>
				<div class="urgent-text">${item.text}</div>
				<div class="summary-box">
					<strong>Summary:</strong> ${item.summary}
				</div>
			</div>
		`).join('') : '<div class="no-data">No urgent items - great job!</div>'}
	</section>
	
	<section>
		<h2>Top Themes</h2>
		${topThemes.length > 0 ? `
			<div class="theme-grid">
				${topThemes.map(({theme, count}) => `
					<div class="theme-card">
						<div class="theme-name">${theme}</div>
						<div class="theme-count">${count}</div>
						<div class="theme-label">Mentions</div>
					</div>
				`).join('')}
			</div>
		` : '<div class="no-data">No themes identified</div>'}
	</section>
</body>
</html>`;
			
			return new Response(html, {
				headers: { 'Content-Type': 'text/html' }
			});
		}
	}

		return Response.json({
			message: "Feedback Samples",
			feedback: [
				{
					id: "1",
					source: "Support Ticket",
					text: "The dashboard is failing to load when I try to view analytics data for the past hour."
				},
				{
					id: "2", 
					source: "Twitter/X",
					text: "Just discovered your product and I'm loving it! The UI is so intuitive and clean."
				},
				{
					id: "3",
					source: "GitHub Issue", 
					text: "Bug: The export functionality fails when trying to download CSV files with special characters."
				},
				{
					id: "4",
					source: "Community Forum",
					text: "Would be great to have dark mode support. My eyes get tired during late night coding sessions."
				}
			]
		});
	}
};
