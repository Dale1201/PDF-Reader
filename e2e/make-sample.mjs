import PDFDocument from 'pdfkit'
import fs from 'node:fs'

const out = process.argv[2] ?? 'sample-book.pdf'
const doc = new PDFDocument({ size: 'A5', margin: 50, info: { Title: 'The Art of Reading Code' } })
doc.pipe(fs.createWriteStream(out))

const chapters = [
  'Why Code Is Literature',
  'Reading Before Writing',
  'Patterns and C++ Idioms',
  'Navigating Large Systems',
  'The Craft of Annotation',
]

doc.fontSize(28).text('The Art of Reading Code', { align: 'center' })
doc.moveDown(2)
doc.fontSize(14).fillColor('#555').text('A sample book for testing', { align: 'center' })

const lorem =
  'Reading code is a skill distinct from writing it. The best engineers spend far more time reading than writing, and the quality of their reading determines the quality of their changes. Consider the humble function: its name promises behavior, its body delivers it, and the gap between promise and delivery is where bugs live. When we annotate, highlight, and bookmark our way through a codebase or a book, we build a private map of the territory. '

chapters.forEach((title, ci) => {
  doc.addPage()
  const top = doc.outline.addItem(title)
  doc.fontSize(22).fillColor('#111').text(`Chapter ${ci + 1}`, { align: 'left' })
  doc.fontSize(18).text(title)
  doc.moveDown()
  for (let p = 0; p < 5; p++) {
    if (p > 0) doc.addPage()
    if (p === 2) top.addItem(`Section ${ci + 1}.1`)
    doc.fontSize(11).fillColor('#222')
    for (let i = 0; i < 3; i++) {
      doc.text(`${lorem} Chapter ${ci + 1}, page ${p + 1}, paragraph ${i + 1}. The searchable token is grep-target-${ci + 1}-${p + 1}.`, { paragraphGap: 10 })
    }
  }
})

doc.end()
console.log('written', out)
